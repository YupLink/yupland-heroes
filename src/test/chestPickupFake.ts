// Модель «Забрать сундук» (магический) для тестов chest-pickup*.test.ts:
// сундуки, охрана, рюкзак снимающего, сеть хозяина, мешочки, журнал, ключи,
// входы. SQL-модули подменены метками с параметрами, а mcpExec пишет так же,
// как оператор под локом: сверяет снимок (отпечатки, «последний», шаблон и HP
// охраны, у чужого — нет ли живой охраны) и делает всё или ничего. vi.mock в
// тесте берёт фабрики отсюда: `vi.mock(путь, async () => (await import(M)).имя)`.
type Row = { k: string; qty: number; loot: number };
type Bagged = { k: string; n: number; loot: number };
type Guard = { tpl: string; name: string; image: null; whole: boolean };
type Stack = { stackKey: string; count: number; potion: boolean; loot?: number };

export const OWNER = "acc_o";
export const THIEF = "acc_t";

export const s = {
  /** Клетка → хозяин сундука. */
  chests: {} as Record<string, string>,
  buried: new Set<string>(),
  /** Живая охрана на клетке 1,2. */
  guard: null as Guard | null,
  /** Кто действует (аккаунт снимающего) и его рюкзак. */
  actor: OWNER,
  bag: [] as Stack[],
  net: [] as Array<{ stackKey: string; count: number }>,
  bags: [] as Array<{ key: string; items: Bagged[] }>,
  journal: {} as Record<string, { items: unknown[]; taken: unknown[]; owner_account: string; raider: string }>,
  ops: new Set<string>(),
  passes: new Set<string>(),
  writes: 0,
  published: [] as string[],
  notes: { move: 0, seize: 0, loot: 0, trades: 0 },
  beforeWrite: null as null | (() => void),
};

/** Сундук хозяина на 1,2 и ещё один на 5,5; целая охрана; в сети 30 руды; вход открыт. */
export function resetPickup(): void {
  s.chests = { "1,2": OWNER, "5,5": OWNER };
  s.buried = new Set();
  s.guard = { tpl: "rbt_1", name: "Тролль", image: null, whole: true };
  s.actor = OWNER;
  s.bag = [];
  s.net = [{ stackKey: "custom:cst_ore", count: 30 }];
  s.bags = [];
  s.journal = {};
  s.ops = new Set();
  s.passes = new Set([OWNER, THIEF]);
  s.writes = 0;
  s.published = [];
  s.notes = { move: 0, seize: 0, loot: 0, trades: 0 };
  s.beforeWrite = null;
}

const fp = (list: ReadonlyArray<{ stackKey: string; count: number }>) =>
  JSON.stringify(
    [...list]
      .sort((a, b) => a.stackKey.localeCompare(b.stackKey))
      .map((x) => [x.stackKey, x.count]),
  );
const lastOf = (owner: string) =>
  Object.entries(s.chests).filter(([c, o]) => c !== "1,2" && o === owner).length === 0;
const netRow = (n: { stackKey: string; count: number }) => ({
  ...n,
  kind: "custom",
  refId: n.stackKey.split(":")[1],
  itemId: null,
  name: n.stackKey,
  image: null,
  potion: false,
});
const standing = (owner: string) => s.chests["1,2"] === owner && !s.buried.has("1,2");

function snapRow(o: { owner: string }) {
  const here = standing(o.owner);
  return {
    chest: here ? { itemId: "cst_mc", name: "Сундук", image: null, potion: false } : null,
    guard: here && s.guard ? { ...s.guard } : null,
    guarded: !!s.guard,
    last: lastOf(o.owner),
    bag: s.bag.map(({ stackKey, count, potion }) => ({ stackKey, count, potion })),
    net: s.net.map(netRow),
    bag_fp: fp(s.bag),
    net_fp: fp(s.net),
  };
}

type Write = {
  owner: string;
  account: string;
  op: string;
  confirm: boolean;
  woundedOk: boolean;
  expect: { bagFp: string; netFp: string; last: boolean; tpl: string | null; whole: boolean | null };
  rows: Row[];
  bagged: Bagged[];
  items: unknown[];
  taken: unknown[];
};

function write(w: Write) {
  s.beforeWrite?.();
  s.beforeWrite = null;
  if (s.ops.has(w.op)) return { was: true, picked: false, here: false };
  const here = standing(w.owner);
  const last = lastOf(w.owner);
  const hasNet = s.net.length > 0;
  const guarded = !!s.guard;
  const e = w.expect;
  const fresh =
    fp(s.bag) === e.bagFp &&
    last === e.last &&
    (!last || fp(s.net) === e.netFp) &&
    (s.guard?.tpl ?? null) === e.tpl &&
    (s.guard ? s.guard.whole : null) === e.whole;
  const wounded = !!s.guard && !s.guard.whole;
  const foreign = w.owner !== w.account;
  const go =
    here &&
    fresh &&
    (w.confirm || !last || !hasNet) &&
    (w.woundedOk || !wounded) &&
    (!foreign || !guarded);
  if (go) {
    s.writes++;
    delete s.chests["1,2"];
    s.guard = null;
    if (last) s.net = [];
    for (const r of w.rows) {
      const cur = s.bag.find((b) => b.stackKey === r.k);
      if (cur) {
        cur.count += r.qty;
        cur.loot = (cur.loot ?? 0) + r.loot;
      } else s.bag.push({ stackKey: r.k, count: r.qty, potion: false, loot: r.loot });
    }
    if (w.bagged.length > 0) {
      s.bags.push({ key: `mcpick:${w.op}`, items: w.bagged.map(({ k, n, loot }) => ({ k, n, loot })) });
    }
    s.journal[w.op] = { items: w.items, taken: w.taken, owner_account: w.owner, raider: w.account };
    s.ops.add(w.op);
  }
  const bagId = go && w.bagged.length > 0 ? "lb_x" : null;
  return { was: false, picked: go, here, guarded, fresh, last, has_net: hasNet, bag_id: bagId };
}

/** Сколько штук вида в рюкзаке снимающего. */
export const count = (key: string) => s.bag.find((b) => b.stackKey === key)?.count ?? 0;
/** Сколько штук вида лежит во всех мешочках. */
export const inBags = (key: string) =>
  s.bags.flatMap((b) => b.items).reduce((n, it) => (it.k === key ? n + it.n : n), 0);

export const reactStart = {
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
};
export const pickupSqlMock = {
  pickupSql: (o: unknown) => `WRITE${JSON.stringify(o)}`,
};
export const snapSqlMock = {
  pickupSnapSql: (o: unknown) => `SNAP${JSON.stringify(o)}`,
  pickupDoneSql: (account: string, op: string) => `DONE${JSON.stringify({ account, op })}`,
};
export const mcp = {
  mcpExec: async (sql: string) => {
    if (sql.startsWith("SNAP")) return [{ _row: snapRow(JSON.parse(sql.slice(4)) as { owner: string }) }];
    if (sql.startsWith("WRITE")) return [{ _row: write(JSON.parse(sql.slice(5)) as Write) }];
    if (!sql.startsWith("DONE")) return [];
    const q = JSON.parse(sql.slice(4)) as { account: string; op: string };
    const done = s.journal[q.op];
    return done && done.raider === q.account ? [done] : [];
  },
};
export const raidLive = { publishRaid: (e: { type: string }) => void s.published.push(e.type) };
export const chestNote = {
  noteChestMove: async () => void s.notes.move++,
  noteChestSeize: async () => void s.notes.seize++,
  noteChestLoot: async () => void s.notes.loot++,
};
export const tradeJournal = { noteTrades: async () => void s.notes.trades++ };
export const bagSweep = { startLootBagSweeper: () => {} };
export const backpack = {
  resolveBackpack: async () => ({ heroId: "h1", capacity: 4, potionCapacity: 0 }),
};
export const pass = {
  requirePass: async (account: string) => {
    if (!s.passes.has(account)) throw new Error("pass.closed");
  },
};
export const passSql = {
  magicTarget: (m: string, q: number, r: number) => `mc:${m}:${q}:${r}`,
};
export const chestRow = {
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: s.actor }),
  chestNearAny: async (a: { account: string }, q: number, r: number) => {
    const owner = s.chests[`${q},${r}`];
    const mine = owner === a.account;
    if (!owner || (s.buried.has(`${q},${r}`) && !mine)) throw new Error("chest.gone");
    if (s.buried.has(`${q},${r}`)) throw new Error("chest.buried");
    if (!mine && s.guard) throw new Error("chest.guarded");
    return { chest: { owner_account: owner, item_id: "cst_mc", name: "Сундук", image: null }, mine };
  },
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  num: (v: unknown) => Number(v) || 0,
};
