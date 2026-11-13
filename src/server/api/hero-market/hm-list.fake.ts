// Подделка базы для тестов выставления: снимок карманов (hm-pockets-read) и
// hero_market_list с семантикой migrations/hero-market-03 — повтор по ключу,
// сверка отпечатка («поменялось»), отказы no_position / pockets_overflow до
// записей, перенос основному по плану (рюкзак основного растёт — следующий герой
// пачки видит его занятым). Заготовленный ответ по копии (byItem) — как раньше.
import type { PocketRow } from "./hm-pockets-plan";

type Stack = { stackKey: string; count: number; potion: boolean };
type Line = PocketRow & { main: number; bag: number; burn: number; plant: number };

export const fx = {
  sqls: [] as string[],
  /** Заготовленный ответ функции по копии; бросить — 'throw:<сообщение>'. */
  byItem: new Map<string, unknown>(),
  /** Выставленные: ключ операции → ответ (повтор отвечает тем же, fresh=false). */
  done: new Map<string, Record<string, unknown>>(),
  /** Основной герой и его ёмкости (resolveBackpack); null — нет основного. */
  main: { heroId: "hi_main", capacity: 2, potionCapacity: 3 } as {
    heroId: string;
    capacity: number;
    potionCapacity: number;
  } | null,
  mainStacks: [] as Stack[],
  /** Карманы героев по копии — с ними функция считает «по-настоящему». */
  pockets: new Map<string, PocketRow[]>(),
  /** Отпечаток рюкзаков сейчас; снимок отдаёт его, функция сверяет. */
  seen: "fp-1",
  /** Сколько следующих вызовов ответят «поменялось». */
  changed: 0,
  onMap: true,
  events: [] as Array<Record<string, unknown>>,
  notes: [] as Array<Record<string, unknown>>,
  planted: [] as Array<Record<string, unknown>>,
  sweeps: 0,
};

export function resetFx(): void {
  fx.sqls = [];
  fx.byItem = new Map();
  fx.done = new Map();
  fx.main = { heroId: "hi_main", capacity: 2, potionCapacity: 3 };
  fx.mainStacks = [];
  fx.pockets = new Map();
  fx.seen = "fp-1";
  fx.changed = 0;
  fx.onMap = true;
  fx.events = [];
  fx.notes = [];
  fx.planted = [];
  fx.sweeps = 0;
}

export const pocket = (
  stackKey: string,
  count: number,
  extra: Partial<PocketRow> = {},
): PocketRow => ({
  stackKey,
  kind: stackKey.split(":")[0],
  refId: stackKey.split(":")[1] ?? null,
  name: stackKey,
  count,
  wear: 0,
  potion: false,
  ...extra,
});

const answer = (r: unknown) => [{ r }];

function snap(sql: string): unknown[] {
  const item = /x\.item_id = '([^']*)'/.exec(sql)?.[1] ?? "";
  const rows = fx.pockets.get(item);
  if (!rows) return [];
  const main = sql.includes("b.hero_id = NULL") ? [] : fx.mainStacks;
  return [{ heroId: `hi_${item}`, pockets: rows, main, seen: fx.seen }];
}

function apply(lines: Line[]): void {
  for (const l of lines) {
    const to = l.main + l.plant;
    if (!(to > 0)) continue;
    const cur = fx.mainStacks.find((s) => s.stackKey === l.stackKey);
    if (cur) cur.count += to;
    else fx.mainStacks.push({ stackKey: l.stackKey, count: to, potion: l.potion });
  }
}

function smart(op: string, item: string, sql: string): unknown[] {
  if (fx.changed > 0) {
    fx.changed -= 1;
    return answer({ ok: false, error: "pockets_changed" });
  }
  const tail = /'(\{"carry"[^']*\})'::jsonb, '([^']*)', (true|false)\) AS r/.exec(sql);
  if (!tail) throw new Error("fake: нет плана в вызове");
  const plan = JSON.parse(tail[1]) as { lines: Record<string, Omit<Line, keyof PocketRow>> };
  if (tail[2] !== fx.seen) return answer({ ok: false, error: "pockets_changed" });
  const lines: Line[] = (fx.pockets.get(item) ?? []).map((p) => ({
    ...p,
    ...plan.lines[p.stackKey],
  }));
  const drop = lines.some((l) => l.bag > 0 || l.burn > 0 || l.plant > 0);
  if (!fx.main && lines.some((l) => l.kind === "dmine"))
    return answer({ ok: false, error: "dmine_no_main" });
  if (drop && !fx.onMap) return answer({ ok: false, error: "no_position" });
  if (drop && tail[3] !== "true") return answer({ ok: false, error: "pockets_overflow" });
  apply(lines);
  fx.pockets.set(item, []);
  const bagged = lines.filter((l) => l.bag > 0).map((l) => ({ ...l, count: l.bag }));
  const cell = { mapId: "rmap_A", q: 5, r: -3 };
  const r = {
    ok: true,
    fresh: true,
    lotId: `hml_${item}`,
    bag: bagged.length ? { id: `lb_${item}`, ...cell, fresh: true } : null,
    pockets: bagged,
    moves: lines,
    mainHero: fx.main?.heroId ?? null,
    planted: lines
      .filter((l) => l.plant > 0)
      .map((l, i) => ({ id: `dm_${item}_${i}`, mushroom: "darai" })),
    cell: drop ? cell : null,
  };
  fx.done.set(op, r);
  return answer(r);
}

function listCall(sql: string): unknown[] {
  const m = /hero_market_list\('([^']*)', '([^']*)', '([^']*)',\s*'([^']*)'/.exec(sql);
  if (!m) return [];
  const [, op, , , item] = m;
  const prior = fx.done.get(op);
  if (prior) return answer({ ...prior, fresh: false });
  const r = fx.byItem.get(item);
  if (typeof r === "string" && r.startsWith("throw:")) throw new Error(r.slice(6));
  if (r) {
    if ((r as { ok: boolean }).ok) fx.done.set(op, r as Record<string, unknown>);
    return answer(r);
  }
  if (!fx.pockets.has(item)) return answer({ ok: false, error: "not_yours" });
  return smart(op, item, sql);
}

export async function fakeExec(sql: string): Promise<unknown[]> {
  fx.sqls.push(sql);
  if (sql.includes("hero_market_list(")) return listCall(sql);
  if (sql.includes("hero_market_pockets_fp(")) return snap(sql);
  return [];
}

/** Вызовы функции выставления (без снимков). */
export const listCalls = (): string[] => fx.sqls.filter((s) => s.includes("hero_market_list("));

/** Подмены модулей (vi.mock(..., async () => (await import("./hm-list.fake")).mocks.x)). */
export const mocks = {
  mcp: { mcpExec: (sql: string) => fakeExec(sql) },
  live: { publishRaid: (e: Record<string, unknown>) => void fx.events.push(e) },
  note: { noteBagPut: async (n: Record<string, unknown>) => void fx.notes.push(n) },
  sweep: { startLootBagSweeper: () => void (fx.sweeps += 1) },
  backpack: {
    resolveBackpack: async () =>
      fx.main
        ? { ...fx.main, heroName: "Main", spec: null, rarity: "rare", trade: 0, alchemy: 0 }
        : null,
  },
  autoplace: {
    autoPlaceDmine: async (d: Record<string, unknown>) => {
      fx.planted.push(d);
      return "placed";
    },
  },
};
