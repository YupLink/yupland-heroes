// Подмены для тестов разборки шахты (mine-dismantle*.test.ts): игрок, клетка,
// шахта, цены Архитектора и модель функции базы raid_mine_dismantle — ключ
// нажатия ложится вместе с делом. В тесте:
// vi.mock("<модуль>", async () => (await import("./mine-dismantle.fake")).<имя>).
import { DEFAULT_ARCHITECT_CONFIG } from "@/lib/castleArchitect";

const fresh = () => ({
  mapId: "rmap_1",
  sql: [] as string[],
  events: [] as unknown[],
  journal: [] as unknown[],
  bumps: [] as unknown[],
  spends: [] as unknown[],
  ops: new Map<string, Record<string, unknown>>(),
  config: { resource: "wood", captureCost: 10 } as Record<string, unknown>,
  effect: "mine",
  owner: null as string | null,
  dbError: null as string | null,
  commitThenLose: false,
  block: false,
  credited: 0,
  /** Мешочек товаров: null — товаров нет (у заготовок по умолчанию их нет). */
  bag: null as string | null,
});

export const s = fresh();
export const resetFake = (): void => void Object.assign(s, fresh());

export const startFn = {
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) =>
        h({ data: check ? check(a.data) : a.data }),
    };
    return fn;
  },
};
export const mineV2 = {
  who: async () => ({ wallet: "w_me", account: "acc_me", mapId: s.mapId }),
};
export const rate = { actionGate: async () => {} };
export const where = {
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: (_p: unknown, q: number) => {
    if (q > 1) throw new Error("Подойди ближе к объекту");
  },
};
export const voidGate = { requireNotVoid: async () => {} };
export const voidCells = { withoutVoid: async (_m: string, c: string[]) => c };
export const building = {
  loadCellBuilding: async () => ({
    name: "Лесопилка",
    effect: s.effect,
    tier: 0,
    tiers: [{}],
    config: s.config,
  }),
};
export const mineRead = { loadMineCell: async () => ({ owner: s.owner }) };
export const architect = { loadArchitectConfig: async () => DEFAULT_ARCHITECT_CONFIG };
export const bump = { bumpAchievement: (...a: unknown[]) => void s.bumps.push(a) };
export const energyNote = { noteEnergySpend: async (...a: unknown[]) => void s.spends.push(a) };
export const journal = {
  recordMapChange: async (mapId: string, change: unknown) => void s.journal.push({ mapId, change }),
};
export const live = { publishRaid: (e: unknown) => void s.events.push(e) };

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";

/** Ресурсные порции вызова → got (minev2-61: ресурсы — сразу на счёт). */
const gotOf = (sql: string): Record<string, number> => {
  const items = JSON.parse(/'(\[.*\])'::jsonb/.exec(sql)?.[1] ?? "[]") as Array<{
    kind: string;
    ref: string;
    n: number;
  }>;
  return Object.fromEntries(items.filter((i) => i.kind === "resource").map((i) => [i.ref, i.n]));
};

/** Модель базы: вызов функции разборки, ключ нажатия, отметка «разослано». */
export const mcp = {
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("yuplink.raid_mine_dismantle(")) {
      if (s.dbError) throw new Error(s.dbError);
      const op = pick(sql, /raid_mine_dismantle\('([^']+)'/);
      const detail = {
        bag: s.bag,
        got: gotOf(sql),
        paid: 100,
        block: s.block,
        credited: s.credited,
        credited_to: s.credited > 0 ? "acc_old" : null,
      };
      s.ops.set(op, { op, map_id: s.mapId, q: 1, r: 0, detail, sent: false, building_id: null });
      if (s.commitThenLose) throw new Error("MCP timeout");
      return [{ res: { ...detail, was: false } }];
    }
    if (sql.includes("FROM yuplink.raid_mine_op o")) {
      const row = s.ops.get(pick(sql, /o\.op = '([^']+)'/));
      return row ? [row] : [];
    }
    if (sql.includes("UPDATE yuplink.raid_mine_op SET detail")) {
      const row = s.ops.get(pick(sql, /WHERE op = '([^']+)'/));
      if (row) row.sent = true;
    }
    return [];
  },
};

type Fn<T> = (a: { data: unknown }) => Promise<T>;
export type DismantleFn = Fn<{ ok: true; bag: string | null; got: Record<string, number> }>;
export type QuoteFn = Fn<{ energy: number; res: Record<string, number>; goods: unknown[] }>;
export const data = { q: 1, r: 0, opId: "op_12345678" };
export const calls = (): number => s.sql.filter((x) => x.includes("raid_mine_dismantle(")).length;
