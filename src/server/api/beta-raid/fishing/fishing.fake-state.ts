// Состояние фейка базы рыбалки (fishing.fake): позиции, рыбалки аккаунтов,
// рюкзаки, справочник, основной инструмент, выбранные герои, клетки берега,
// настройка и часы — и общие помощники операторов. Вынесено из fishing.fake
// (лимит ≤250 строк).
import type { FishingConfig } from "@/lib/raid/fishing";

export type Stack = { count: number; wear: number };
export type FakeFishing = {
  op: string;
  heroId: string;
  mapId: string;
  q: number;
  r: number;
  posAt: number | null;
  nextAt: number;
  tries: number;
  caught: number;
  seenAt: number;
  actedAt: number | null;
  actedPos: number | null;
  claim: string | null;
  stoppedAt: number | null;
  reason: string | null;
  /** Заказано попыток (plan_tries). */
  planTries: number;
  /** Соль зерна (seed_salt); null — строка до выката соли. */
  salt: string | null;
  /** Шанс заброса (chance_pct); null — шанс из настройки мира. */
  chancePct?: number | null;
  /** Ступени шанса (chance_steps) — текст jsonb; null — шанс один на заброс. */
  chanceSteps?: string | null;
};

/** Соль заброса в фейке — от ключа (в базе случайная): тест знает исход заранее. */
export const saltOf = (op: string): string => `salt-${op}`;

export const fx = {
  now: 1_000_000,
  cfg: null as FishingConfig | null,
  /** Аккаунт → клетка и версия позиции (updated_at). */
  pos: new Map<string, { q: number; r: number; map: string; ver: number }>(),
  fishing: new Map<string, FakeFishing>(),
  /** Выбранные герои (selected_at IS NOT NULL). */
  selected: new Set<string>(),
  main: new Map<string, string | null>(),
  packs: new Map<string, Map<string, Stack>>(),
  catalog: new Map<
    string,
    { name: string; rod?: boolean; shovel?: boolean; wear?: number | null }
  >(),
  /** Клетки карты: "q,r" → вода ли. */
  cells: new Map<string, boolean>(),
  /** ref строк журнала сделок (trade_journal), записанных выдачей улова. */
  journal: [] as string[],
  sql: [] as string[],
  /** Ответ оператора с этой меткой потеряется (применён, попытка — ошибка). */
  loseOn: null as string | null,
  /** Оператор с меткой упадёт до записи — после skip удачных таких же. */
  failOn: null as { tag: string; skip: number } | null,
};

export function resetFx(): void {
  Object.assign(fx, {
    now: 1_000_000,
    cfg: null,
    pos: new Map(),
    fishing: new Map(),
    selected: new Set(),
    main: new Map(),
    packs: new Map(),
    catalog: new Map(),
    cells: new Map(),
    journal: [],
    sql: [],
    loseOn: null,
    failOn: null,
  });
}

export const packOf = (hero: string): Map<string, Stack> => {
  if (!fx.packs.has(hero)) fx.packs.set(hero, new Map());
  return fx.packs.get(hero)!;
};
export const idOf = (key: string | null | undefined) =>
  (key ?? "").slice((key ?? "").indexOf(":") + 1);
export const isRod = (key: string | null | undefined) =>
  !!key && fx.catalog.get(idOf(key))?.rod === true;
export const alive = (hero: string, key: string | null | undefined) =>
  !!key && (packOf(hero).get(key)?.count ?? 0) >= 1;

/** Зеркало mainOkSql 'rod': удочка в руках или становится ею (одна / замена кончившейся). */
export function rodOkModel(hero: string, key: string): boolean {
  const stored = fx.main.get(hero) ?? null;
  const rods = [...packOf(hero)].filter(([k, s]) => isRod(k) && s.count >= 1).length;
  return isRod(key) && (stored === key || (!alive(hero, stored) && (isRod(stored) || rods === 1)));
}

export const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
export const row = (v: unknown) => [{ _row: v }];
