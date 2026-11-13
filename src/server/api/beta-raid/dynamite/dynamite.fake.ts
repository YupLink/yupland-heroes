// Подмены для тестов броска динамита (dynamite-*.test.ts): игрок, рюкзак, декор,
// модель функции базы raid_dynamite_blast (ключ нажатия ложится вместе с делом)
// и общий журнал «что ушло наружу и в каком порядке» (s.log). В тесте:
// vi.mock("<модуль>", async () => (await import("./dynamite.fake")).<имя>).
const fresh = () => ({
  mapId: "rmap_1",
  island: false,
  pos: { q: 0, r: 0 },
  hero: "hero_1" as string | null,
  /** Что ответит функция базы (без was); null — ответа нет. */
  result: null as Record<string, unknown> | null,
  dbError: null as string | null,
  commitThenLose: false,
  ops: new Map<string, { detail: Record<string, unknown>; sent: boolean; crewDue?: boolean }>(),
  /** Синий по кораблям: кто ещё стоит на обломках, отказ переноса, кого отнесли. */
  stranded: new Set<string>(),
  homeFail: false,
  homes: [] as unknown[],
  dismantles: new Map<string, { sent: boolean }>(),
  decorRows: [] as Array<{ q: number; r: number; d: string }>,
  /** Клетки воды под красным взрывом (dynamite-fish). */
  waterRows: [] as Array<{ q: number; r: number }>,
  blastCalls: [] as string[],
  log: [] as unknown[],
  spends: [] as unknown[],
  payouts: [] as unknown[],
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
export const actor = {
  pchestActor: async () => ({
    wallet: "w_me",
    account: "acc_me",
    mapId: s.island ? "isle_x" : s.mapId,
  }),
};
export const where = { playerCell: async () => s.pos };
export const backpack = {
  resolveBackpack: async () => (s.hero ? { heroId: s.hero, capacity: 10 } : null),
};
export const decorLoad = {
  loadInteractiveDecor: async () => ({
    decoration_oak: {
      cost: 5,
      itemId: "cst_wood",
      amount: "3",
      respawnMin: 30,
      label: { ru: "Срубить", en: "Chop" },
      name: "Дуб",
      itemName: "Дерево",
      itemImage: null,
    },
    decoration_palm: {
      cost: 5,
      itemId: "cst_juice",
      amount: "1",
      label: { ru: "Выжать", en: "Squeeze out" },
      name: "Пальма",
      itemName: "Сок",
      itemImage: null,
    },
  }),
};
export const bagParts = {
  groupItems: async (items: Array<{ itemId: string; amount: number; origin: string }>) => ({
    groups: items.map((it) => ({
      stackKey: `custom:${it.itemId}`,
      kind: "custom",
      refId: it.itemId,
      itemId: it.itemId,
      name: "Дерево",
      image: null,
      count: it.amount,
      marks: { mob: 0, mine: 0, field: 0, loot: it.amount },
      items: [],
    })),
    bad: [],
  }),
};
export const live = {
  publishRaid: (e: Record<string, unknown>, ...by: unknown[]) =>
    void s.log.push({ event: e.type, ...e, ...(by.length ? { by: by[0] } : {}) }),
};
/** Перенос домой (spell-teleport-home): отнесённый с обломков ушёл. */
export const home = {
  teleportHome: async (key: string, opts: unknown) => {
    s.homes.push({ key, opts });
    if (s.homeFail) return { ok: false, reasonKey: "spell.teleport_failed" };
    s.stranded.delete(key);
    return { ok: true, moved: { q: 34, r: 64 }, map: null };
  },
};
export const journal = {
  recordMapChange: async (mapId: string, change: unknown) =>
    void s.log.push({ journal: change, mapId }),
};
export const dismantleAnnounce = {
  announceDismantle: async (row: { op: string }) => {
    s.log.push({ dismantle: row.op });
    const d = s.dismantles.get(row.op);
    if (d) d.sent = true;
    return true;
  },
};
export const lostNotify = { kickMineLostNotify: () => void s.log.push({ notify: true }) };
export const sweep = { startLootBagSweeper: () => {} };
export const respawn = {
  scheduleDecorRespawn: async (o: unknown) => void s.log.push({ respawn: o }),
};
export const energyNote = {
  noteEnergySpend: async (...a: unknown[]) => void s.spends.push(a),
};
export const target = {
  loadEncounterTarget: async (id: string) => ({
    kind: "boss",
    templateId: id.split(":")[1],
    name: "Волк",
    imageUrl: null,
    backgroundUrl: null,
    badgeLabel: "Босс",
    maxHp: 1000,
    interactionCost: 10,
    rewardConfig: null,
    abilities: [],
    damage: null,
  }),
};
export const payout = {
  payoutByTop: async (o: Record<string, unknown>) => {
    s.payouts.push({ hpId: o.hpId, generation: o.generation, viewer: o.viewer, q: o.q, r: o.r });
    return [{ kind: "darai", amount: 5, packId: null }];
  },
  claimObjectPayout: async () => true,
};
export const rewards = { grantEncounterRewards: async () => [] };
export const hooks = {
  noteCellsChanged: async (_m: string, keys: string[]) => void s.log.push({ cells: keys }),
};
export const reveal = { revealRunnerAt: async () => null };

/** Модель базы: ключ нажатия, функция взрыва, ключи разборок, декор клеток. */
export const mcp = {
  mcpExec: async (sql: string) => {
    const op = /'(dyn:acc_me:[^']+)'/.exec(sql)?.[1] ?? "";
    if (sql.includes("FROM yuplink.raid_dynamite_op WHERE op")) {
      const row = s.ops.get(op);
      return row ? [{ detail: row.detail, sent: row.sent }] : [];
    }
    const acc = /account_id = '([^']+)'/.exec(sql)?.[1] ?? /to_jsonb\('([^']+)'/.exec(sql)?.[1];
    if (sql.includes("AS stranded")) return [{ stranded: s.stranded.has(acc ?? "") }];
    if (sql.includes("'{homed}'")) {
      const d = s.ops.get(op)?.detail;
      if (d) d.homed = [...((d.homed as string[] | undefined) ?? []), acc];
      return [];
    }
    if (sql.includes("SET crew_due = false")) {
      const row = s.ops.get(op);
      if (row) row.crewDue = false;
      return [];
    }
    if (sql.includes("WHERE o.crew_due")) {
      return [...s.ops]
        .filter(([, v]) => v.crewDue)
        .map(([k, v]) => ({ op: k, map_id: s.mapId, detail: v.detail }));
    }
    if (sql.includes("UPDATE yuplink.raid_dynamite_op SET sent_at")) {
      const row = s.ops.get(op);
      if (row) row.sent = true;
      s.log.push({ sent: op });
      return [];
    }
    if (sql.includes("yuplink.raid_dynamite_blast(")) {
      s.blastCalls.push(sql);
      if (s.dbError) throw new Error(s.dbError);
      const detail = { ...(s.result ?? {}) };
      for (const m of (detail.mines as Array<{ op: string }> | undefined) ?? [])
        s.dismantles.set(m.op, { sent: false });
      const crewDue = ((detail.ships as Array<{ crew?: string }> | undefined) ?? []).some(
        (x) => x.crew,
      );
      s.ops.set(op, { detail, sent: false, crewDue });
      if (s.commitThenLose) throw new Error("bridge: connection reset");
      return [{ res: { ...detail, was: false } }];
    }
    if (sql.includes("FROM yuplink.raid_mine_op o")) {
      const dop = /o\.op = '([^']+)'/.exec(sql)?.[1] ?? "";
      const d = s.dismantles.get(dop);
      return d
        ? [{ op: dop, map_id: s.mapId, q: 1, r: 0, detail: {}, sent: d.sent, building_id: null }]
        : [];
    }
    if (sql.includes("c.decoration_id AS d")) return s.decorRows;
    if (sql.includes("JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id"))
      return s.waterRows;
    return [];
  },
};

export type ThrowFn = (a: { data: unknown }) => Promise<import("./dynamite-throw").DynamiteThrown>;
