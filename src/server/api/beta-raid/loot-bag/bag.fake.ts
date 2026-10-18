// Фейк базы мешочков для тестов loot-bag/*.test: таблицы в памяти и операторы,
// исполненные так, как их выполнил бы Postgres под локом (каждый — целиком,
// между ними — await: параллельные заходы перемешиваются по операторам).
//
// Построители SQL в тестах подменены (bag.fake-mocks): вместо текста они отдают
// «FAKE:{json}», и модель исполняет команду по смыслу оператора. Сам текст SQL
// держит bag-sql.test. Мост моделируется режимами: replay — оператор применён,
// ответ потерян, повтор вернул свой ответ (слепой ретрай); loseOn — применён,
// но все попытки кончились ошибкой; failOn — упал до записи (по разу на запись).
//
// Содержимое мешочка — порции (вид, срок, штуки, метки), как в
// raid_loot_bag_item: срок 24 часа с попадания, у бугорка — с закапывания.
import { createHash } from "node:crypto";
import {
  ORIGINS,
  originAdds,
  originPlus,
  originWithin,
  type OriginQty,
} from "@/server/api/beta-raid/stack-origin";

export const DUST = 0.001;
export const TTL = 24 * 3600_000;
export const md5 = (s: string) => createHash("md5").update(s).digest("hex");
export const round = (n: number) => Math.round(n * 1e9) / 1e9;

export type Item = { kind: string; refId: string | null; name: string; image: string | null };
/** Порция мешочка: вид, срок, штуки, метки. */
export type Portion = Item & { stackKey: string; expiresAt: number; count: number; marks: OriginQty };
export type FakeBag = {
  id: string;
  mapId: string;
  q: number;
  r: number;
  createdAt: number;
  updatedAt: number;
  buried: boolean;
  droppedBy: string;
  items: Portion[];
};
/** Из какой порции сколько снято (ключ снятия — для отката). */
export type Part = { e: number; n: number; marks: OriginQty };
export type FakeOp = {
  bagId: string;
  heroId: string | null;
  kind: string;
  stackKey: string | null;
  qty: number;
  marks: OriginQty;
  parts?: Part[];
  state: string;
  at: number;
  /** nonce вызова «закопать/выкопать» (mine на повторе моста). */
  nonce?: string;
};
export type Stack = { count: number; marks: OriginQty; wear: number };

export const db = {
  now: 1_000_000,
  /** Вход «Открыть» (§8.23) жив: false — «Сначала открой». */
  pass: true,
  bags: new Map<string, FakeBag>(),
  ops: new Map<string, FakeOp>(),
  /** raid_backpack_op: ключи выдачи в рюкзак (и метки «забора» bpx:). */
  bpOps: new Set<string>(),
  /** Кошелёк/аккаунт → выбранный герой (нет — героя нет). */
  heroes: new Map<string, { heroId: string; capacity: number; potionCapacity: number }>(),
  /** Рюкзаки: герой → ключ стопки → стопка. */
  packs: new Map<string, Map<string, Stack>>(),
  /** Где стоит игрок (по кошельку) и чей он аккаунт. */
  pos: new Map<string, { q: number; r: number }>(),
  accounts: new Map<string, string>(),
  /** Разведанное: «аккаунт|q,r» (beta_raid_fog_seen). */
  seen: new Set<string>(),
  /** Справочник своих товаров: id → имя, лопата ли, износ за удар. */
  catalog: new Map<string, { name: string; shovel?: boolean; wear?: number | null }>(),
  voids: new Set<string>(),
  events: [] as string[],
  sql: [] as string[],
  replay: 0,
  /** Команда, у которой ответ потеряется (применена, все попытки — ошибка). */
  loseOn: null as string | null,
  /** Команды, которые упадут до записи (сбой базы), — по разу на запись. */
  failOn: [] as string[],
  /** Следующие выдачи в рюкзак: применить и потерять ответ / упасть до записи. */
  loseDeposit: 0,
  failDeposit: 0,
  /** Падает выдача только этой стопки (иначе — любая). */
  failDepositKey: null as string | null,
  /** Снимок рюкзака для расчёта места — пустой (устарел к моменту выдачи). */
  staleBag: false,
  /** Чтение героя «мигнуло»: resolveBackpack отвечает «нет героя», хотя он есть. */
  heroReadFails: false,
};

export function resetDb(): void {
  Object.assign(db, {
    now: 1_000_000,
    pass: true,
    bags: new Map(),
    ops: new Map(),
    bpOps: new Set(),
    heroes: new Map(),
    packs: new Map(),
    pos: new Map(),
    accounts: new Map(),
    seen: new Set(),
    catalog: new Map(),
    voids: new Set(),
    events: [],
    sql: [],
    replay: 0,
    loseOn: null,
    failOn: [],
    loseDeposit: 0,
    failDeposit: 0,
    failDepositKey: null,
    staleBag: false,
    heroReadFails: false,
  });
}

export const packOf = (heroId: string): Map<string, Stack> => {
  let p = db.packs.get(heroId);
  if (!p) db.packs.set(heroId, (p = new Map()));
  return p;
};
const cellsOf = (p: Map<string, Stack>) =>
  [...p.values()].reduce((s, x) => s + Math.ceil(Math.max(0, x.count) / 20), 0);
export const livePortion = (p: Portion): boolean => p.count > 0 && p.expiresAt > db.now;
export const alive = (b: FakeBag | undefined): b is FakeBag => !!b && b.items.some(livePortion);
/** Сколько вида stackKey живо в мешочке (сумма порций). */
export const countOf = (b: FakeBag | undefined, stackKey: string): number =>
  round(
    (b?.items ?? [])
      .filter((p) => p.stackKey === stackKey && livePortion(p))
      .reduce((s, p) => s + p.count, 0),
  );
export const readMarks = (count: number, m: OriginQty) => originWithin(count, m);
export const minus = (a: OriginQty, b: OriginQty) => {
  const out = { ...a };
  for (const k of ORIGINS) out[k] = Math.max(0, round(a[k] - b[k]));
  return out;
};
/** Снятие с порции/стопки по правилу траты: безымянное первым. Отдаёт ушедшие метки. */
export function spend(s: { count: number; marks: OriginQty }, n: number): OriginQty {
  const was = readMarks(s.count, s.marks);
  s.count = round(s.count - n);
  s.marks = readMarks(s.count, was);
  return minus(was, s.marks);
}

/** Выдача в рюкзак — как depositToBackpack: ключ повтора, атомарная проверка места. */
export function deposit(o: {
  heroId: string;
  nonce: string;
  capacity: number;
  stackKey: string;
  item: Item;
  qty: number;
  origin: unknown;
}): void {
  if (db.bpOps.has(`bp:${o.nonce}`)) return;
  const pack = packOf(o.heroId);
  const cur = pack.get(o.stackKey);
  const occ = cellsOf(pack);
  const was = cur?.count ?? 0;
  const next = occ - Math.ceil(was / 20) + Math.ceil((was + o.qty) / 20);
  if (next > Math.max(o.capacity, occ)) {
    throw new Error(`market.backpack_need:${next - occ}:${Math.max(0, o.capacity - occ)}`);
  }
  const add = originAdds(o.qty, o.origin as Parameters<typeof originAdds>[1]);
  const marks = originPlus(cur ? readMarks(was, cur.marks) : originAdds(0, null), add);
  pack.set(o.stackKey, { count: round(was + o.qty), marks, wear: cur?.wear ?? 0 });
  db.bpOps.add(`bp:${o.nonce}`);
}

/** «Забор» выдачи: true — не было и уже не будет. */
export function fence(nonce: string): boolean {
  if (!db.bpOps.has(`bp:${nonce}`)) {
    db.bpOps.add(`bp:${nonce}`);
    db.bpOps.add(`bpx:${nonce}`);
    return true;
  }
  return db.bpOps.has(`bpx:${nonce}`);
}

/** Положить мешочек напрямую (тесты чтения и сборщика). */
export function seedBag(
  id: string,
  o: Partial<Omit<FakeBag, "id" | "items">> & { items: Array<Partial<Portion> & { stackKey: string; count: number }> },
): FakeBag {
  const bag: FakeBag = {
    id,
    mapId: "map1",
    q: 0,
    r: 0,
    createdAt: db.now,
    updatedAt: db.now,
    buried: false,
    droppedBy: "acc1",
    ...o,
    items: o.items.map((p) => ({
      kind: "custom",
      refId: p.stackKey.split(":")[1] ?? null,
      name: p.stackKey,
      image: null,
      expiresAt: db.now + TTL,
      marks: originAdds(0, null),
      ...p,
    })),
  };
  db.bags.set(id, bag);
  return bag;
}

export type Cmd = Record<string, unknown> & { cmd: string };
