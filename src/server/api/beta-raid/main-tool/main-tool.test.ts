// Основной инструмент на сервере (§8.24): выбрать и снять; рубит только
// основной нужный; «Взять топор» — и рубит; сломалась штука — следующая той же
// стопки, кончилась лопата — другая лопата, кончилось всё — основного нет;
// выбор при однозначности; гонка «сменил основной / ударил» — одно из двух.
//
// Базы нет: main-tool.fake исполняет операторы по смыслу (гард удара —
// mainOkModel, зеркало mainOkSql). Выбор стопки, удар, откат — настоящие.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx, packOf, resetFx } from "./main-tool.fake";

const who = vi.hoisted(() => ({ wallet: "w1" }));
vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./main-tool.fake")).fakeExec,
}));
vi.mock("../market-backpack", () => ({
  resolveBackpack: async (w: string) => (w === "nohero" ? null : { heroId: `h_${w}` }),
}));
vi.mock("../item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
}));
vi.mock("@/server/auth", () => ({ requireWallet: () => who.wallet }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("../gate", () => ({ requireBetaRaid: async () => who.wallet }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
}));

const { payDecorTool, NEED_TOOL } = await import("../decor-tool");
const { chargeShovel } = await import("../loot-bag/bag-shovel");
const { dropInteractiveDecorCache } = await import("../decor-interact");
const { setMainTool } = await import("./main-tool-set");
const { withMainTool } = await import("./main-tool-read");

const H = "h_w1";
const [AXE, PICK, SH1, SH2] = [
  "custom:cst_axe",
  "custom:cst_pick",
  "custom:cst_sh1",
  "custom:cst_sh2",
];
const NOT_MAIN = (tool: string) => `tool.not_main|${JSON.stringify({ tool })}`;
type Call = (a: { data: unknown }) => Promise<{ ok: true; main: string | null }>;
const take = (stackKey: string | null, wallet = "w1") => {
  who.wallet = wallet;
  return (setMainTool as unknown as Call)({ data: { stackKey } });
};
let n = 0;
const chop = (id = "cst_axe", name = "Топор") =>
  payDecorTool("w1", [{ id, name, wear: 34 }], `decor:m:0:0:${++n}`);
const chopped = async (id?: string, name?: string) => (await chop(id, name)).done();
const dig = async () => (await chargeShovel("w1", H, `gdig:acc:${++n}`)).done();
const stack = (key: string) => packOf(H).get(key);
const put = (key: string, count: number, wear = 0) => packOf(H).set(key, { count, wear });
/** Что видит окно рюкзака: основной сейчас (живые стопки, как loadStacks). */
const shownMain = async () => {
  const stacks = [...packOf(H)]
    .filter(([, s]) => s.count > 0)
    .map(([stackKey, s]) => ({
      stackKey,
      count: s.count,
      durability: 100 - s.wear,
      shovel: stackKey.includes("_sh"),
    }));
  return (await withMainTool(H, stacks)).mainTool;
};

beforeEach(() => {
  resetFx();
  dropInteractiveDecorCache();
  fx.catalog.set("cst_axe", { name: "Топор", wear: 34 });
  fx.catalog.set("cst_pick", { name: "Кирка", wear: 34 });
  fx.catalog.set("cst_sh1", { name: "Лопата", shovel: true, wear: 25 });
  fx.catalog.set("cst_sh2", { name: "Лопата-2", shovel: true, wear: 50 });
  fx.catalog.set("cst_wood", { name: "Дерево" });
  fx.decorTools = ["cst_axe", "cst_pick"];
});

describe("выбрать и снять основной", () => {
  it("взять топор, убрать из рук; основным бывает только инструмент с целой штукой", async () => {
    put(AXE, 2);
    put(SH1, 1);
    put("custom:cst_wood", 5);
    expect(await take(AXE)).toEqual({ ok: true, main: AXE });
    expect(fx.main.get(H)).toBe(AXE);
    expect(await take(SH1)).toEqual({ ok: true, main: SH1 });
    expect(await take(null)).toEqual({ ok: true, main: null });
    expect(fx.main.get(H)).toBeNull();
    await expect(take("custom:cst_wood")).rejects.toThrow("tool.not_tool");
    await expect(take(PICK)).rejects.toThrow("tool.gone");
    await expect(take(AXE, "nohero")).rejects.toThrow("market.backpack_no_hero");
  });
});

describe("рубка — только основным нужным", () => {
  it("в руках кирка — топором не рубит («возьми в руки»), износа нет; взял топор — рубит", async () => {
    put(AXE, 1);
    put(PICK, 1);
    fx.main.set(H, PICK);
    await expect(chop()).rejects.toThrow(NOT_MAIN("Топор"));
    expect(stack(AXE)).toEqual({ count: 1, wear: 0 });
    // «Взять Топор» — одно нажатие, и рубка идёт.
    await take(AXE);
    await chopped();
    expect(stack(AXE)).toEqual({ count: 1, wear: 34 });
  });

  it("в руках лопата — «Взять Топор»; топора нет вовсе — «Нужен топор»", async () => {
    put(SH1, 1);
    put(AXE, 1);
    fx.main.set(H, SH1);
    await expect(chop()).rejects.toThrow(NOT_MAIN("Топор"));
    packOf(H).delete(AXE);
    await expect(chop()).rejects.toThrow(NEED_TOOL);
  });

  it("основного нет, подходящий один — он рубит и становится основным", async () => {
    put(AXE, 1);
    put(PICK, 1);
    await chopped();
    expect(fx.main.get(H)).toBe(AXE);
    // Теперь в руках топор: кирке нужно «Взять».
    await expect(chop("cst_pick", "Кирка")).rejects.toThrow(NOT_MAIN("Кирка"));
  });
});

describe("износ и копии", () => {
  it("сломалась штука — следующая той же стопки остаётся основной; кончились — основного нет", async () => {
    put(AXE, 2);
    fx.main.set(H, AXE);
    for (let i = 0; i < 3; i++) await chopped(); // 34, 68, сломана
    expect(stack(AXE)).toEqual({ count: 1, wear: 0 });
    expect(fx.main.get(H)).toBe(AXE);
    expect(await shownMain()).toBe(AXE);
    for (let i = 0; i < 3; i++) await chopped();
    expect(stack(AXE)).toEqual({ count: 0, wear: 0 });
    expect(await shownMain()).toBeNull();
    await expect(chop()).rejects.toThrow(NEED_TOOL);
  });

  it("кончилась лопата в руках — основной сама становится другая лопата", async () => {
    put(SH1, 1, 75);
    put(SH2, 1);
    fx.main.set(H, SH1);
    await dig(); // 75 + 25 — сломана
    expect(stack(SH1)).toEqual({ count: 0, wear: 0 });
    expect(await shownMain()).toBe(SH2);
    await dig();
    expect(stack(SH2)).toEqual({ count: 1, wear: 50 });
    expect(fx.main.get(H)).toBe(SH2);
  });

  it("лопат две, основного нет — сначала выбрать; в руках топор — «Взять лопату»", async () => {
    put(SH1, 1);
    put(SH2, 1, 50);
    await expect(dig()).rejects.toThrow(NOT_MAIN("Лопата-2"));
    put(AXE, 1);
    fx.main.set(H, AXE);
    await expect(dig()).rejects.toThrow(NOT_MAIN("Лопата-2"));
    await take(SH1);
    await dig();
    expect(stack(SH1)).toEqual({ count: 1, wear: 25 });
  });

  it("0 % нигде: у живой штуки износ всегда меньше 100", async () => {
    put(AXE, 3);
    fx.main.set(H, AXE);
    for (let i = 0; i < 9; i++) {
      await chopped();
      const s = stack(AXE)!;
      if (s.count >= 1) expect(s.wear).toBeLessThan(100);
    }
    expect(stack(AXE)).toEqual({ count: 0, wear: 0 });
    expect(await shownMain()).toBeNull();
  });
});

describe("гонки", () => {
  it("основного нет: топор и лопата разом — бьёт один, второй «возьми в руки», в руках один", async () => {
    put(AXE, 1);
    put(SH1, 1);
    const out = await Promise.allSettled([chopped(), dig()]);
    const ok = out.filter((o) => o.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const lost = out.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("tool.not_main");
    const worn = [stack(AXE)!.wear, stack(SH1)!.wear].filter((w) => w > 0);
    expect(worn).toHaveLength(1);
    expect(fx.main.get(H)).toBe(stack(AXE)!.wear > 0 ? AXE : SH1);
  });

  it("сменил основной, пока шла рубка, — удар старым не проходит, износ не снят", async () => {
    put(AXE, 1);
    put(PICK, 1);
    fx.main.set(H, AXE);
    const [a, b] = await Promise.allSettled([take(PICK), chop()]);
    expect(a.status).toBe("fulfilled");
    if (b.status === "rejected") expect(stack(AXE)!.wear).toBe(0);
    else expect(stack(AXE)!.wear).toBe(34);
    expect(fx.main.get(H)).toBe(PICK);
  });
});
