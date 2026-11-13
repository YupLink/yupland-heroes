// Фейк базы обычного сундука для тестов plain-chest/*.test: таблицы в памяти и
// операторы, исполненные так, как их выполнил бы Postgres под локом (каждый —
// целиком, между ними — await: параллельные заходы перемешиваются по
// операторам). Построители SQL подменены (pchest.fake-mocks): вместо текста они
// отдают «FAKE:{json}», модель (pchest.fake-cmd) исполняет команду по смыслу.
// Сам текст SQL держит pchest-sql.test. Мост моделируется режимами: replay —
// оператор применён, ответ потерян, слепой повтор вернул свой ответ; lose —
// применён, все попытки кончились ошибкой; fail — упал до записи.
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { createHash } from "node:crypto";
import { originWithin, type OriginQty } from "@/server/api/beta-raid/stack-origin";

export const md5 = (s: string) => createHash("md5").update(s).digest("hex");
export const round = (n: number) => Math.round(n * 1e9) / 1e9;
export const DUST = 0.001;
export const NO: OriginQty = { mob: 0, mine: 0, field: 0, loot: 0 };

/** Стопка рюкзака: штуки, износ текущей штуки, метки происхождения. */
export type Pack = { count: number; wear: number; marks: OriginQty; kind: string; name: string };
export type FakeChest = {
  id: string;
  q: number;
  r: number;
  itemId: string;
  name: string;
  buried: boolean;
  placedBy: string;
};
export type Slot = { count: number; kind: string; refId: string | null; name: string };
export type FakeOp = { state: string; qty: number; result: unknown; kind: string };

export const f = {
  /** Обычные сундуки: «q,r» → сундук. */
  chests: new Map<string, FakeChest>(),
  /** Ячейки: id сундука → ключ стека → стек. */
  slots: new Map<string, Map<string, Slot>>(),
  ops: new Map<string, FakeOp>(),
  /** Магические сундуки: «q,r» → владелец и закопан ли. */
  magic: new Map<string, { owner: string; buried: boolean }>(),
  /** Охрана магического: жива ли и кто победил. */
  guards: new Map<string, { alive: boolean; killedBy: string | null }>(),
  /** Мешочки с остатком «Забрать сундук»: id → клетка и порции. */
  bags: new Map<string, { q: number; r: number; droppedBy: string; items: Map<string, number> }>(),
  packs: new Map<string, Map<string, Pack>>(),
  heroes: new Map<string, { heroId: string; capacity: number; potionCapacity: number }>(),
  accounts: new Map<string, string>(),
  pos: new Map<string, { q: number; r: number }>(),
  /** Ключи стеков — зелья (галочка у товара). */
  potions: new Set<string>(),
  /** Свои товары: id → имя, сундук ли. */
  catalog: new Map<string, { name: string; plain?: boolean }>(),
  /** Клетки, которые держит что-то кроме сундука (постройка, вода, декор…). */
  blocked: new Set<string>(),
  /** Живой объект на клетке (босс воскрес поверх бугорка). */
  objects: new Set<string>(),
  /** Декор вырос поверх бугорка (дополнение №5). */
  decor: new Set<string>(),
  /** Клетка — часть здания: закапывать под ним нельзя (владелец 03.10). */
  building: new Set<string>(),
  events: [] as string[],
  /** Энергия по кошельку (нет строки — 100). */
  energy: new Map<string, number>(),
  /** Вход (§8.23): все двери открыты — тестам, которым вход не важен. */
  passAll: true,
  /** Входы: «аккаунт|цель» → до какого момента, версия позиции, ключ нажатия. */
  passes: new Map<string, { until: number; ver: number; op: string; cost: number; at: number }>(),
  /** Версия позиции героя по аккаунту: шаг меняет её (updated_at позиции). */
  ver: new Map<string, number>(),
  /** Часы фейка, мс. */
  clock: 0,
  /** Сеть магического сундука по владельцу: ключ стека → штук. */
  net: new Map<string, Map<string, number>>(),
  /** Сколько раз снимали износ лопаты (и откатывали). */
  wear: { hits: 0, backs: 0 },
  sweepers: 0,
  notes: 0,
  replay: 0,
  lose: null as string | null,
  fail: [] as string[],
};

export function resetFake(): void {
  Object.assign(f, {
    chests: new Map(),
    slots: new Map(),
    ops: new Map(),
    magic: new Map(),
    guards: new Map(),
    bags: new Map(),
    packs: new Map(),
    heroes: new Map(),
    accounts: new Map(),
    pos: new Map(),
    potions: new Set(),
    catalog: new Map(),
    blocked: new Set(),
    objects: new Set(),
    decor: new Set(),
    building: new Set(),
    events: [],
    energy: new Map(),
    passAll: true,
    passes: new Map(),
    ver: new Map(),
    clock: 0,
    net: new Map(),
    wear: { hits: 0, backs: 0 },
    sweepers: 0,
    notes: 0,
    replay: 0,
    lose: null,
    fail: [],
  });
}

export const packOf = (heroId: string): Map<string, Pack> => {
  let p = f.packs.get(heroId);
  if (!p) f.packs.set(heroId, (p = new Map()));
  return p;
};
export const slotsOf = (chestId: string): Map<string, Slot> => {
  let s = f.slots.get(chestId);
  if (!s) f.slots.set(chestId, (s = new Map()));
  return s;
};
export const chestById = (id: string): FakeChest | undefined =>
  [...f.chests.values()].find((c) => c.id === id);

/** Метки после списания: не больше нового count, безымянное ушло первым. */
export const readMarks = (count: number, m: OriginQty) => originWithin(count, m);

/** Положить в стопку рюкзака без меток (сундук меток не хранит). */
export function addToPack(heroId: string, key: string, qty: number, name = key): void {
  const p = packOf(heroId);
  const cur = p.get(key);
  if (cur) {
    const count = round(cur.count + qty);
    p.set(key, { ...cur, count, marks: readMarks(count, cur.marks) });
  } else p.set(key, { count: round(qty), wear: 0, marks: { ...NO }, kind: "custom", name });
}

/** Ячеек занято: стеки по CELL_SIZE, пыль — целая ячейка. */
export const cellsOf = (counts: number[]) =>
  counts.reduce((n, c) => n + (c > 0 ? Math.ceil(c / CELL_SIZE) : 0), 0);

/** Отпечаток набора стеков — как md5 по «ключ=count» в порядке ключей. */
export const fp = (list: Iterable<[string, { count: number }]>) =>
  JSON.stringify(
    [...list]
      .filter(([, s]) => s.count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, s]) => [k, s.count]),
  );

/** На клетке сундук: обычный (и бугорок) или магический. */
export const chestAtCell = (key: string): boolean => f.chests.has(key) || f.magic.has(key);

/** Энергия кошелька (нет строки — 100). */
export const energyOf = (wallet: string): number => f.energy.get(wallet) ?? 100;

/** Живой вход: не истёк и герой с тех пор не сходил с клетки (версия позиции та же). */
export function passAlive(account: string, target: string): boolean {
  if (f.passAll) return true;
  const p = f.passes.get(`${account}|${target}`);
  return !!p && p.until > f.clock && p.ver === (f.ver.get(account) ?? 0);
}

/** Под зданием не закапывают (bag-actor.requireNotUnderBuilding): клетка из f.building — отказ. */
export async function underBuildingMock(_m: string, q: number, r: number): Promise<void> {
  if (f.building.has(`${q},${r}`)) throw new Error("dig.under_building");
}
