// Подмены модулей для тестов обычного сундука — поверх фейка (pchest.fake.ts).
// В тесте: vi.mock("<модуль>", async () => (await import("./pchest.fake-mocks")).<имя>).
// Построители SQL отдают «FAKE:{json}» — фейк исполняет команду по смыслу.
import { z } from "zod";
import { hexDistance } from "@/lib/raid/hex";
import { hitStack, undoHit } from "@/lib/raid/toolWear";
import { chestById, energyOf, f, packOf, passAlive } from "@/server/api/beta-raid/plain-chest/pchest.fake";
import { runCmd } from "@/server/api/beta-raid/plain-chest/pchest.fake-cmd";

const fake =
  (cmd: string) =>
  (o: object = {}) =>
    `FAKE:${JSON.stringify({ cmd, ...o })}`;

/** Кто сейчас зовёт ручку (кошелёк). */
export const who = { wallet: "w1" };

export const mcp = {
  mcpExec: async (sql: string) => {
    await Promise.resolve();
    if (sql.includes("ALIVE(")) {
      const m = /ALIVE\(([^|]+)\|'?([^')]+)'?\)/.exec(sql);
      return [{ alive: !!m && passAlive(m[1], m[2]) }];
    }
    if (sql.includes("AS guarded")) {
      const m = /(-?\d+)::int AS q, (-?\d+)::int AS r/.exec(sql);
      return [{ guarded: !!m && f.objects.has(`${m[1]},${m[2]}`) }];
    }
    if (!sql.startsWith("FAKE:")) return [];
    const cmd = JSON.parse(sql.slice(5)) as { cmd: string };
    const at = f.fail.indexOf(cmd.cmd);
    if (at >= 0) {
      f.fail.splice(at, 1);
      throw new Error("MCP timeout");
    }
    let out = runCmd(cmd);
    if (f.replay > 0) {
      f.replay--;
      out = runCmd(cmd);
    } else if (f.lose === cmd.cmd) {
      f.lose = null;
      throw new Error("MCP timeout");
    }
    return out;
  },
};

export const live = { publishRaid: (e: { cells: string[] }) => void f.events.push(...e.cells) };

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

const account = (wallet: string) => f.accounts.get(wallet) ?? null;
const near = (wallet: string, q: number, r: number) => {
  const p = f.pos.get(wallet);
  if (!p || hexDistance(p.q, p.r, q, r) > 1) throw new Error("chest.approach");
};
const plainAt = (q: number, r: number) => {
  const c = f.chests.get(`${q},${r}`);
  return c ? { ...c, image: null } : null;
};

export const rowMod = {
  pchestActor: async () => {
    const acc = account(who.wallet);
    if (!acc) throw new Error("market.need_account");
    return { wallet: who.wallet, mapId: "map1", account: acc };
  },
  moveInput: z.object({
    q: z.number().int(),
    r: z.number().int(),
    stackKey: z.string().min(1).max(200),
    qty: z.number().positive().max(100_000),
    op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  }),
  plainAtSql: () => "",
  loadPlainChest: async (_m: string, q: number, r: number) => plainAt(q, r),
  plainNear: async (a: { wallet: string }, q: number, r: number) => {
    const c = plainAt(q, r);
    if (!c) throw new Error("pchest.gone");
    if (c.buried) throw new Error("pchest.buried");
    near(a.wallet, q, r);
    return c;
  },
  whyNotHere: async (_m: string, q: number, r: number) =>
    plainAt(q, r)?.buried ? "pchest.buried" : "pchest.gone",
  isPlainChestStack: async (key: string) => f.catalog.get(key.split(":")[1] ?? "")?.plain === true,
  loadOp: async (op: string) => f.ops.get(op) ?? null,
};

export const readMod = {
  loadSlot: async (chestId: string, key: string) => {
    const s = f.slots.get(chestId)?.get(key);
    return s && s.count > 0 ? { stackKey: key, ...s, image: null } : null;
  },
  loadSlots: async () => [],
  getPlainChest: async () => null,
};

export const sqlMods = {
  move: { putSql: fake("put"), takeSql: fake("take") },
  place: { placePlainSql: fake("place"), opSweepSql: fake("opSweep"), plainIdSql: () => "" },
  pickup: {
    pickupSnapSql: fake("snap"),
    pickupWriteSql: fake("pickup"),
    leftoverKey: (id: string) => `pchest:${id}`,
  },
  dig: {
    flipSql: fake("flip"),
    flipFenceSql: fake("flipFence"),
    flipLockKey: () => "",
    flipRef: () => "",
  },
};

export const backpack = {
  resolveBackpack: async (wallet: string) => {
    const h = f.heroes.get(wallet);
    return h ? { ...h, heroName: "Герой", spec: null, rarity: "rare", trade: 0, alchemy: 0 } : null;
  },
};

export const toolWear = {
  movableStackCount: async (heroId: string, key: string) => {
    const s = packOf(heroId).get(key);
    return { movable: s ? Math.max(0, s.count - (s.wear > 0 ? 1 : 0)) : 0, worn: !!s && s.wear > 0 };
  },
};

export const netRead = {
  loadBag: async (heroId: string) =>
    [...packOf(heroId)]
      .filter(([, s]) => s.count > 0)
      .map(([stackKey, s]) => ({
        stackKey,
        kind: s.kind,
        name: s.name,
        image: null,
        count: s.count,
        movable: 0,
        potion: f.potions.has(stackKey),
      })),
};

export const potionBag = {
  potionKeysOf: async (keys: readonly string[]) => new Set(keys.filter((k) => f.potions.has(k))),
};

export const SHOVEL = "custom:cst_shovel";
export const shovel = {
  NEED_SHOVEL: "bag.need_shovel",
  chargeShovel: async (_w: string, heroId: string) => {
    const s = packOf(heroId).get(SHOVEL);
    const hit = s ? hitStack({ count: s.count, wear: s.wear }, 50) : null;
    if (!s || !hit) throw new Error("bag.need_shovel");
    Object.assign(s, { count: hit.count, wear: hit.wear });
    f.wear.hits++;
    let undone = false;
    return {
      back: async () => {
        if (undone) return;
        undone = true;
        f.wear.backs++;
        const cur = packOf(heroId).get(SHOVEL) ?? { ...s, count: 0, wear: 0 };
        packOf(heroId).set(SHOVEL, { ...cur, ...undoHit(cur, hit.taken) });
      },
      done: async () => {},
    };
  },
};

export const chestRow = {
  loadChest: async (_m: string, q: number, r: number) => {
    const m = f.magic.get(`${q},${r}`);
    return m ? { owner_account: m.owner, item_id: "cst_mc", name: "МС", image: null, buried: m.buried } : null;
  },
  requireChestNear: async (wallet: string, _m: string, q: number, r: number) => near(wallet, q, r),
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  num: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0),
};

export const guardRead = {
  loadGuardRow: async (_m: string, q: number, r: number) => {
    const g = f.guards.get(`${q},${r}`);
    return g ? { killed_at: g.alive ? null : "x", current_hp: g.alive ? 10 : 0 } : null;
  },
  guardAlive: (g: { killed_at: unknown; current_hp: number } | null) =>
    !!g && g.killed_at == null && g.current_hp > 0,
};

export const misc = {
  where: { playerCell: async (w: string) => f.pos.get(w) ?? { q: 0, r: 0 } },
  voidGate: { requireNotVoid: async () => {} },
  alias: {
    refFromStackKey: (key: string) => key.slice(key.indexOf(":") + 1) || null,
    canonCustomMeta: async (id: string) => {
      const c = f.catalog.get(id);
      return c ? { name: c.name, image: null } : null;
    },
  },
  note: { notePlain: async () => void f.notes++, plainNotes: () => [] },
  journal: { noteTrades: async () => void f.notes++ },
  sweep: { startLootBagSweeper: () => void f.sweepers++ },
  bagActor: {
    guardedSql: () => "EXISTS(guarded)",
    blockedAt: async (_m: string, q: number, r: number) =>
      f.objects.has(`${q},${r}`) ? "bag.guarded" : f.decor.has(`${q},${r}`) ? "bag.decor" : null,
  },
};

/** Для проверок: id сундука клетки. */
export const chestIdAt = (q: number, r: number) => f.chests.get(`${q},${r}`)?.id ?? "";
export { chestById };

/** Вход (§8.23): живой — по фейку (f.passAll открывает всё). */
export const passMod = {
  requirePass: async (acc: string, target: string) => {
    if (!passAlive(acc, target)) throw new Error("pass.closed");
  },
  passOpen: async (acc: string, target: string) => passAlive(acc, target),
};
export const passSql = {
  PASS_MINUTES: 10,
  bagTarget: (id: string) => `lb:${id}`,
  plainTarget: (id: string) => `pc:${id}`,
  magicTarget: (m: string, q: number, r: number) => `mc:${m}:${q}:${r}`,
  passAliveSql: (acc: string, target: string) => `ALIVE(${acc}|${target})`,
  cellsPriceSql: (table: string, where: string) => `CELLS:${table}|${where}`,
  openPassSql: fake("open"),
  closePassSql: fake("close"),
};
/** 2 энергии за переворот — с кошелька фейка; нехватка — ключ «Нужно N энергии». */
export const digPay = {
  payDig: async (wallet: string) => {
    const have = energyOf(wallet);
    if (have < 2) throw new Error('braid.need_energy|{"n":2}');
    f.energy.set(wallet, have - 2);
    return { refund: async () => void f.energy.set(wallet, energyOf(wallet) + 2) };
  },
};
