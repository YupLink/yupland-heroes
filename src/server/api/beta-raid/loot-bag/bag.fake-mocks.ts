// Подмены модулей для тестов мешочков — поверх фейка базы (bag.fake.ts).
// В тесте: vi.mock("<модуль>", async () => (await import("./bag.fake-mocks")).<имя>).
//
// Построители SQL отдают «FAKE:{json}» — фейк исполняет команду по смыслу
// оператора. Прочие запросы (строка мешочка у «подойди», позиции для забора,
// исход ключа) фейк узнаёт по тексту.
import { hitStack, movableCount, undoHit } from "@/lib/raid/toolWear";
import {
  alive,
  db,
  deposit,
  livePortion,
  packOf,
  round,
} from "@/server/api/beta-raid/loot-bag/bag.fake";
import { runCmd } from "@/server/api/beta-raid/loot-bag/bag.fake-cmd";

const fake =
  (cmd: string) =>
  (o: object = {}) =>
    `FAKE:${JSON.stringify({ cmd, ...o })}`;
const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
const unwrap = (rows: unknown[], wrap: boolean) =>
  wrap ? rows.map((r) => (r as { _row: unknown })._row) : rows;
const row = (v: unknown) => [{ _row: v }];

/** Кто сейчас зовёт ручку (кошелёк). */
export const who = { wallet: "w1" };

function inline(sql: string): unknown[] {
  if (sql.includes("AS alive") && sql.includes("FROM yuplink.raid_loot_bag b")) {
    const b = db.bags.get(pick(sql, /b\.id = '([^']+)'/));
    return b ? row({ id: b.id, q: b.q, r: b.r, buried: b.buried, alive: alive(b) }) : [];
  }
  if (sql.includes('AS "droppedBy"')) {
    // Позиции мешочка: живые порции по видам.
    const b = db.bags.get(pick(sql, /i\.bag_id = '([^']+)'/));
    const pos = new Map<string, Record<string, unknown>>();
    for (const p of (b?.items ?? []).filter(livePortion)) {
      const m = pos.get(p.stackKey);
      if (m) m.count = round(Number(m.count) + p.count);
      else pos.set(p.stackKey, { ...p, droppedBy: b?.droppedBy ?? null });
    }
    return [...pos.values()].map((v) => ({ _row: v }));
  }
  if (sql.includes("FROM yuplink.raid_loot_bag_op o")) {
    const o = db.ops.get(pick(sql, /o\.op = '([^']+)'/));
    const p = db.bags.get(o?.bagId ?? "")?.items.find((x) => x.stackKey === o?.stackKey);
    return o ? row({ qty: o.qty, stackKey: o.stackKey, kind: p?.kind, refId: p?.refId, name: p?.name, image: null }) : [];
  }
  if (sql.includes("FROM yuplink.hero_instance h")) {
    // Выбран ли герой у аккаунта (bag-deliver-parts.heroless) — по фейку героев.
    const acc = pick(sql, /h\.account_id = '([^']+)'/);
    const wallets = [...db.accounts].filter(([, a]) => a === acc).map(([w]) => w);
    return row({ has: [acc, ...wallets].some((k) => db.heroes.has(k)) });
  }
  if (sql.includes("FROM yuplink.raid_loot_bag_op WHERE op")) {
    const o = db.ops.get(pick(sql, /WHERE op = '([^']+)'/));
    return o ? row({ state: o.state, qty: o.qty }) : [];
  }
  return [];
}

export const mcp = {
  mcpExec: async (sql: string, opts?: { wrapJson?: boolean; wrapJsonCte?: boolean }) => {
    db.sql.push(sql);
    await Promise.resolve();
    const wrap = !!(opts?.wrapJson || opts?.wrapJsonCte);
    if (!sql.startsWith("FAKE:")) return unwrap(inline(sql), wrap);
    const cmd = JSON.parse(sql.slice(5));
    const fail = db.failOn.indexOf(cmd.cmd);
    if (fail >= 0) {
      db.failOn.splice(fail, 1);
      throw new Error("MCP timeout");
    }
    let out = runCmd(cmd);
    if (db.replay > 0) {
      db.replay--;
      out = runCmd(cmd);
    } else if (db.loseOn === cmd.cmd) {
      db.loseOn = null;
      throw new Error("MCP timeout");
    }
    return unwrap(out, wrap);
  },
};

export const live = { publishRaid: (e: { cells: string[] }) => void db.events.push(...e.cells) };

export const bagSql = {
  DUST: 0.001,
  PORTION_TTL: "now() + interval '24 hours'",
  ITEM_COLS: "",
  str: (v: string | null) => (v ? `'${v}'` : "NULL"),
  num: (v: number) => String(v),
  livePortion: (x: string) => `${x}.count > 0 AND ${x}.expires_at > now()`,
  bagLockSql: () => "",
  dropSql: (at: object, stacks: object[]) => fake("drop")({ at, stacks }),
  dropFenceSql: (at: object) => fake("dropFence")({ at }),
};
export const takeSqlMod = { takeSql: fake("take") };
export const putSqlMod = { putSql: fake("put"), putFenceSql: fake("putFence") };
export const backSqlMod = {
  takeDoneSql: (op: string) => fake("done")({ op }),
  fenceSql: (heroId: string, nonce: string) => fake("fence")({ heroId, nonce }),
  backSql: fake("back"),
  staleTakesSql: () => fake("stale")(),
};
export const digSqlMod = { digSql: fake("dig"), digFenceSql: fake("digFence") };
export const readSql = {
  nearSql: fake("near"),
  cellSql: fake("cell"),
  shovelSql: (heroId: string) => fake("shovel")({ heroId }),
  sweepSql: () => fake("sweep")(),
};

type DepositItem = { kind: string; refId: string | null; id?: string | null; name: string; image: string | null };
type Deposit = { heroId: string; nonce: string; capacity: number; item: DepositItem; qty: number; origin?: unknown };
export const backpack = {
  resolveBackpack: async (owner: string) => {
    const h = db.heroReadFails ? undefined : db.heroes.get(owner);
    return h ? { ...h, heroName: "Герой", spec: null, rarity: "rare", trade: 0, alchemy: 0 } : null;
  },
  stackKeyFor: async (it: { kind: string; refId?: string | null; id?: string | null }) =>
    `${it.kind}:${it.refId ?? it.id}`,
  depositToBackpack: async (o: Deposit) => {
    await Promise.resolve();
    const stackKey = `${o.item.kind}:${o.item.refId ?? o.item.id}`;
    // Сбой базы ДО записи (всех выдач или одной стопки): ничего не легло, ответа нет.
    if (db.failDeposit > 0 && (!db.failDepositKey || db.failDepositKey === stackKey)) {
      db.failDeposit--;
      throw new Error("MCP timeout");
    }
    deposit({ ...o, stackKey, item: { ...o.item, refId: o.item.refId ?? null }, origin: o.origin });
    if (db.loseDeposit > 0) {
      db.loseDeposit--;
      throw new Error("MCP timeout");
    }
  },
};

export const netRead = {
  // staleBag — снимок рюкзака старше записи (место заняли между расчётом и выдачей).
  loadBag: async (heroId: string) =>
    [...(db.staleBag ? new Map() : packOf(heroId))]
      .filter(([, s]) => s.count > 0)
      .map(([stackKey, s]) => ({
        stackKey,
        kind: "custom",
        name: stackKey,
        image: null,
        count: s.count,
        movable: 0,
        potion: false,
      })),
};

export const alias = {
  refFromStackKey: (key: string) => key.slice(key.indexOf(":") + 1) || null,
  canonCustomMeta: async (id: string) => {
    const c = db.catalog.get(id);
    return c ? { name: c.name, image: null } : null;
  },
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
};

/** Износ инструмента — модель tool-wear: ключ удара, откат ровно снятого. */
const wearOps = new Map<
  string,
  { heroId: string; stackKey: string; taken: number; undone: boolean; settled: boolean }
>();
export const toolWear = {
  wearTool: async (o: { heroId: string; stackKey: string; op: string; step: number }) => {
    await Promise.resolve();
    if (wearOps.has(o.op)) return wearOps.get(o.op)?.undone ? ("none" as const) : ("ok" as const);
    const s = packOf(o.heroId).get(o.stackKey);
    const next = s ? hitStack({ count: s.count, wear: s.wear }, o.step) : null;
    if (!s || !next) return "none" as const;
    Object.assign(s, { count: next.count, wear: next.wear });
    wearOps.set(o.op, {
      heroId: o.heroId,
      stackKey: o.stackKey,
      taken: next.taken,
      undone: false,
      settled: false,
    });
    return "ok" as const;
  },
  undoToolWear: async (o: { heroId: string; stackKey: string; op: string }) => {
    const cur = wearOps.get(o.op);
    if (!cur) return void wearOps.set(o.op, { ...o, taken: 0, undone: true, settled: false });
    if (cur.undone || cur.settled) return;
    cur.undone = true;
    const s = packOf(cur.heroId).get(cur.stackKey);
    if (s) Object.assign(s, undoHit({ count: s.count, wear: s.wear }, cur.taken));
  },
  settleToolWear: async (o: { op: string }) => {
    const cur = wearOps.get(o.op);
    if (cur) cur.settled = true;
  },
  movableStackCount: async (heroId: string, stackKey: string) => {
    const s = packOf(heroId).get(stackKey);
    return { movable: s ? movableCount(s) : 0, worn: !!s && s.wear > 0 };
  },
  resetWear: () => wearOps.clear(),
};

export const session = {
  gate: { requireBetaRaid: async () => who.wallet },
  rate: { actionGate: async () => {} },
  where: {
    myMapId: async () => "map1",
    activeBetaMapId: async () => "map1",
    ownCell: async (wallet: string) => db.pos.get(wallet) ?? null,
  },
  move: { accAccountId: async (wallet: string) => db.accounts.get(wallet) ?? null },
  owner: { raidOwner: async (key: string) => db.accounts.get(key) ?? key },
  voidGate: {
    canIgnoreVoid: (wallet: string) => wallet === "admin",
    requireNotVoid: async (wallet: string, _m: string, q: number, r: number) => {
      if (wallet !== "admin" && db.voids.has(`${q},${r}`)) throw new Error("braid.void_blocked");
    },
  },
};

/** createServerFn без сети: валидатор входа — как в проде, ручка — прямым вызовом. */
export const startFn = {
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
};

/** Вход (§8.23) у тестов мешочка открыт всегда; энергия за переворот — счётчиком. */
const closed = () => Promise.reject(new Error("pass.closed"));
export const pass = { requirePass: async () => (db.pass ? undefined : closed()), passOpen: async () => db.pass };
export const energy = { spent: 0, refunded: 0 };
export const digPay = {
  payDig: async () => {
    energy.spent += 2;
    return { refund: async () => void (energy.refunded += 2) };
  },
};
