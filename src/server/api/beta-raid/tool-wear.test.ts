// Прочность инструмента (владелец, 28.09): 25 % ×4 = одна штука, пусто — штука
// за удар, остаток удара на следующую не переходит; гонка двух рубок одним
// топором и слепой повтор моста снимают износ ровно за каждую настоящую рубку;
// откат рубки возвращает прочность (и штуку, если удар её доломал).
//
// Базы нет: фейк держит стопку и ключи рубок и выполняет операторы удара и
// отката по одному — как их выполнил бы Postgres под локом героя. Арифметика
// фейка — модель lib/raid/toolWear; что SQL считает так же, держат
// tool-wear-sql.test и сверка формул SELECT-ом на живой базе.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hitStack, undoHit } from "@/lib/raid/toolWear";

type Op = { taken: number; undone: boolean; settled: boolean; at: number };
const s = vi.hoisted(() => ({
  stack: null as { count: number; wear: number } | null,
  ops: new Map<string, { taken: number; undone: boolean; settled: boolean; at: number }>(),
  sql: [] as string[],
  /** Мост применил оператор, но ответ потерялся: n раз подряд. */
  lose: 0,
  /** Мост повторил оператор вслепую (ответ первой попытки потерян). */
  replay: false,
  /** Часы фейка и когда стопка опустела (уборка — только старше 10 минут). */
  clock: 0,
  zeroAt: 0,
}));

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
/** Другая рубка ещё в деле: ключ не закрыт и моложе 30 с. */
const live = (op: string) =>
  [...s.ops].some(([k, o]) => k !== op && !o.settled && !o.undone && s.clock - o.at < 30_000);

function run(sql: string): unknown[] {
  const op = pick(sql, /WHERE op = '([^']+)'/);
  if (sql.includes("INSERT INTO yuplink.raid_tool_wear_op (op, hero_id, stack_key, taken, mob")) {
    const step = Number(pick(sql, /s\.wear \+ (\d+) >= 100/));
    const cur = s.ops.get(op);
    if (cur) return [{ _row: { was: !cur.undone, dead: cur.undone, hit: false, busy: live(op) } }];
    if (live(op)) return [{ _row: { was: false, hit: false, busy: true } }];
    const next = s.stack ? hitStack(s.stack, step) : null;
    if (!next) return [{ _row: { was: false, hit: false, busy: false } }];
    s.stack = { count: next.count, wear: next.wear };
    if (next.count <= 0) s.zeroAt = s.clock;
    s.ops.set(op, { taken: next.taken, undone: false, settled: false, at: s.clock });
    return [{ _row: { was: false, hit: true, busy: false } }];
  }
  if (sql.includes("tomb AS (")) {
    const cur: Op | undefined = s.ops.get(op);
    if (!cur) {
      s.ops.set(op, { taken: 0, undone: true, settled: false, at: s.clock });
      return [{ _row: { flipped: false, back: false, tomb: true } }];
    }
    if (cur.undone || cur.settled) return [{ _row: { flipped: false, back: false, tomb: false } }];
    cur.undone = true;
    if (s.stack && cur.taken > 0) s.stack = undoHit(s.stack, cur.taken);
    return [{ _row: { flipped: true, back: !!s.stack, tomb: false } }];
  }
  if (sql.includes("SET settled = true")) {
    const cur = s.ops.get(op);
    if (cur) cur.settled = true;
    const old = s.clock - s.zeroAt >= 10 * 60_000;
    if (s.stack && s.stack.count <= 0 && s.stack.wear === 0 && old) s.stack = null;
    return [];
  }
  throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
}

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    await Promise.resolve();
    const out = run(sql);
    if (s.replay) {
      s.replay = false;
      return run(sql);
    }
    if (s.lose > 0) {
      s.lose--;
      throw new Error("MCP timeout");
    }
    return out;
  },
}));
vi.mock("./market-backpack", () => ({ resolveBackpack: async () => ({ heroId: "h1" }) }));
vi.mock("./item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
}));
// Топор в руках (§8.24): выбор стопки видит стопку фейка; гард — в тексте удара.
vi.mock("./main-tool/main-tool-read", () => ({
  loadToolState: async () => ({
    stored: { key: "custom:cst_axe", shovel: false },
    stacks:
      s.stack && s.stack.count >= 1
        ? [{ stackKey: "custom:cst_axe", count: s.stack.count, name: "Топор", toolWear: null }]
        : [],
  }),
}));

const { payDecorTool, NEED_TOOL, TOOL_BUSY } = await import("./decor-tool");
const { hitSql, undoSql, settleToolWear } = await import("./tool-wear");

let n = 0;
/** Одна рубка: износ товара `wear` (нет — «ломается сразу»). */
const chop = (wear: number | null = 25) =>
  payDecorTool("w1", [{ id: "cst_axe", name: "Топор", wear }], `decor:m:1:0:${++n}`);
/** Рубка прошла целиком: удар и закрытие ключа. */
const chopped = async (wear: number | null = 25) => (await chop(wear)).done();
const left = () => s.stack && { ...s.stack };
const AT = { heroId: "h1", stackKey: "custom:cst_axe" };

beforeEach(() => {
  Object.assign(s, {
    stack: { count: 2, wear: 0 },
    ops: new Map(),
    sql: [],
    lose: 0,
    replay: false,
    clock: 0,
    zeroAt: 0,
  });
});

describe("износ за удар", () => {
  it("25 % ×4 = ровно одна штука; следующая начинает со 100 %", async () => {
    const seen: Array<{ count: number; wear: number } | null> = [];
    for (let i = 0; i < 4; i++) {
      await chopped();
      seen.push(left());
    }
    expect(seen).toEqual([
      { count: 2, wear: 25 },
      { count: 2, wear: 50 },
      { count: 2, wear: 75 },
      { count: 1, wear: 0 },
    ]);
  });

  it("пусто — ломается с первого удара, как раньше: штука за декор", async () => {
    await chopped(null);
    expect(left()).toEqual({ count: 1, wear: 0 });
    await chopped(null);
    expect(left()).toEqual({ count: 0, wear: 0 }); // пустая — до уборки, игроку не видна
    await expect(chop(null)).rejects.toThrow(NEED_TOOL);
    s.clock += 11 * 60_000;
    await settleToolWear({ ...AT, op: "wear:any" });
    expect(left()).toBeNull(); // старше 10 минут — убрана
  });

  it("30 %: четыре удара на штуку, остаток на следующую не переходит", async () => {
    s.stack = { count: 1, wear: 0 };
    for (let i = 0; i < 3; i++) await chopped(30);
    expect(left()).toEqual({ count: 1, wear: 90 });
    await chopped(30);
    expect(left()).toEqual({ count: 0, wear: 0 });
  });
});

describe("атомарность", () => {
  it("гонка двух рубок одним топором — одна рубит, вторая «инструмент занят»", async () => {
    s.stack = { count: 1, wear: 75 };
    const out = await Promise.allSettled([chop(), chop()]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const lost = out.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain(TOOL_BUSY);
    expect([...s.ops.values()].filter((o) => o.taken > 0)).toHaveLength(1);
    expect(left()).toEqual({ count: 0, wear: 0 });
  });

  it("первая прошла и доломала последнюю — следующая «нужен топор»", async () => {
    s.stack = { count: 1, wear: 75 };
    await chopped();
    await expect(chop()).rejects.toThrow(NEED_TOOL);
  });

  it("рубка «в деле» больше 30 с (упала, не закрыв ключ) — топор снова рубит", async () => {
    await chop(); // ключ не закрыт
    await expect(chop()).rejects.toThrow(TOOL_BUSY);
    s.clock += 31_000;
    await chopped();
    expect(left()).toEqual({ count: 2, wear: 50 });
  });

  it("мост повторил удар вслепую — износ снят один раз, рубка засчитана", async () => {
    s.replay = true;
    await chop();
    expect(left()).toEqual({ count: 2, wear: 25 });
  });

  it("ответ удара потерян насовсем — откат по ключу вернул снятое, отказ", async () => {
    s.lose = 1;
    await expect(chop()).rejects.toThrow(NEED_TOOL);
    expect(left()).toEqual({ count: 2, wear: 0 });
  });
});

describe("откат рубки (сбой после списания)", () => {
  it("состоявшуюся рубку откат не трогает", async () => {
    const tool = await chop();
    await tool.done();
    await tool.back();
    expect(left()).toEqual({ count: 2, wear: 25 });
  });

  it("возвращает прочность; повтор отката второй раз не прибавит", async () => {
    s.stack = { count: 2, wear: 50 };
    const tool = await chop();
    expect(left()).toEqual({ count: 2, wear: 75 });
    await tool.back();
    await tool.back();
    expect(left()).toEqual({ count: 2, wear: 50 });
  });

  it("удар доломал последнюю штуку — откат поднимает её с прежним износом", async () => {
    s.stack = { count: 1, wear: 75 };
    const tool = await chop();
    expect(left()).toEqual({ count: 0, wear: 0 });
    await tool.back();
    expect(left()).toEqual({ count: 1, wear: 75 });
  });

  it("пока рубка в деле, соседняя тем же топором ждёт; после отката — рубит точно", async () => {
    s.stack = { count: 1, wear: 50 };
    const a = await chop(); // 50 → 75
    await expect(chop()).rejects.toThrow(TOOL_BUSY); // двойной тап — ни износа, ни потери
    await a.back(); // рубка A сорвалась: 75 → 50
    await chopped(); // рубка B: 50 → 75
    expect(left()).toEqual({ count: 1, wear: 75 });
  });

  it("удар не дошёл до базы — откат кладёт заглушку, опоздавший удар ничего не снимет", () => {
    const at = { ...AT, op: "wear:late" };
    run(undoSql(at));
    run(hitSql({ ...at, step: 25 }));
    expect(s.ops.get("wear:late")).toMatchObject({ taken: 0, undone: true });
    expect(left()).toEqual({ count: 2, wear: 0 });
  });

  it("ключ рубки — свой на каждую рубку", async () => {
    await chopped();
    await chopped();
    const ops = s.sql
      .filter((x) => x.includes("taken, mob_taken)"))
      .map((x) => pick(x, /WHERE op = '([^']+)'/));
    expect(new Set(ops).size).toBe(2);
    expect(ops[0]).toMatch(/^wear:decor:/);
  });
});
