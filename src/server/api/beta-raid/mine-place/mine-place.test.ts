// Ручка «Поставить шахту» по чертежу (§8.59.8) поверх фейковой базы: что
// проверяется до записи, куда ставится, какой отказ видит игрок, что повтор
// нажатия не ставит вторую шахту, а карта и окна узнают о шахте без F5 — и ключ
// отмечается разосланным, только когда дельта записалась. Чертёж лежит там, куда
// раньше смотрела «стрелка» (dq, dr от героя).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  execError: null as string | null,
  opRow: null as { q: number; r: number; kind?: string; sent?: boolean } | null,
  plan: null as Record<string, unknown> | null,
  recordFail: false,
  dict: "ok" as "ok" | "fail" | "empty", // словарь шаблона: сбой запроса, пусто
  pos: { q: 10, r: 5 },
  hero: true as boolean,
  voidCells: [] as string[],
  /** Проходимые клетки вокруг цели (проверка прохода) и отпечаток шахт. */
  walk: [] as Array<[number, number]>,
  patches: [] as Array<{ mapId: string; patches: unknown[]; assets: unknown }>,
  published: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/kind, stack_key FROM yuplink\.raid_mine_plan/.test(sql)) return s.plan ? [s.plan] : [];
    if (/WHERE o\.op = /.test(sql)) {
      const o = s.opRow;
      if (!o) return [];
      const kind = o.kind ?? "wood";
      const building = kind === "wood" ? "building_yYIdx793rM" : "building_IbP4EseH2O";
      return [{ op: "k", map_id: "rmap_1", sent: false, building_id: building, kind, ...o }];
    }
    if (/UNION ALL SELECT NULL, NULL/.test(sql)) {
      return [...s.walk.map(([q, r]) => ({ q, r, k: null })), { q: null, r: null, k: "K1" }];
    }
    if (/WITH prior AS/.test(sql)) {
      if (s.execError) throw new Error(s.execError);
      return s.row ? [{ _row: s.row }] : [];
    }
    if (/FROM yuplink\.mystic_item_template\s+WHERE id =/.test(sql)) {
      if (s.dict === "fail") throw new Error("bridge timeout");
      const t = { id: "building_yYIdx793rM", name: "Лесопилка", meta: { effect: "mine" } };
      return s.dict === "empty" ? [] : [t];
    }
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: "rmap_1", account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_k: string, ref: string | null) => ref,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => (s.hero ? { heroId: "h1", capacity: 8, potionCapacity: 2 } : null),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ playerCell: async () => s.pos }));
vi.mock("@/server/api/beta-raid/voidGate", () => ({
  requireNotVoid: async (_w: string, _m: string, q: number, r: number) => {
    if (s.voidCells.includes(`${q},${r}`)) throw new Error("braid.void_blocked");
  },
}));
vi.mock("@/server/api/beta-raid/voidCells", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    mapId: string,
    change: { patches: unknown[] },
    assetsFor?: () => Promise<unknown>,
  ) => {
    if (s.recordFail) throw new Error("revision locked");
    s.patches.push({ mapId, patches: change.patches, assets: await assetsFor?.() });
    return 1;
  },
}));

const { placeMineBlueprint } = await import("./mine-place");
const place = (data: Record<string, unknown>) => {
  const d = { stackKey: "custom:cst_mine_bp_wood", dq: 1, dr: 0, ...data };
  const [q, r] = [s.pos.q + Number(d.dq), s.pos.r + Number(d.dr)];
  s.plan = { map_id: "rmap_1", q, r, kind: "wood", stack_key: d.stackKey };
  return (placeMineBlueprint as unknown as Fn)({ data: { op: "op123456" } });
};
const placedRow = { was: false, placed: true, cell: true, box: true };
const mill = { id: "building_yYIdx793rM", name: "Лесопилка" };

beforeEach(() => {
  Object.assign(s, {
    row: placedRow,
    execError: null,
    opRow: null,
    recordFail: false,
    dict: "ok",
    pos: { q: 10, r: 5 },
    hero: true,
    voidCells: [],
  });
  s.sql.length = 0;
  s.patches.length = 0;
  s.published.length = 0;
});

const placeSql = () => s.sql.find((x) => x.includes("WITH prior AS")) ?? "";
const sentMarks = () => s.sql.filter((x) => x.includes("SET sent_at = now()"));

describe("постановка", () => {
  it("ставит на соседнюю клетку от героя и рассылает её всем", async () => {
    await expect(place({})).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
    expect(placeSql()).toContain("c.map_id = 'rmap_1' AND c.q = 11 AND c.r = 5");
    expect(placeSql()).toContain("'mplace:acc_1:op123456'");
    expect(s.patches).toEqual([
      {
        mapId: "rmap_1",
        patches: [
          {
            q: 11,
            r: 5,
            buildingId: "building_yYIdx793rM",
            buildingSkinId: null,
            buildingConfig: { effect: "mine" }, // только отметка шахты, как у кисти
          },
        ],
        assets: { buildings: { building_yYIdx793rM: { ...mill, tiers: [], effect: "mine" } } },
      },
    ]);
    expect(sentMarks()).toHaveLength(1);
    expect(sentMarks()[0]).toContain("WHERE op = 'mplace:acc_1:op123456' AND sent_at IS NULL");
    // owner: у соседей флажок шахты перечитывается сразу (чужая — красная).
    expect(s.published).toEqual([
      { mapId: "rmap_1", type: "built", mine: true, owner: true, cells: ["11,5"] },
    ]);
  });

  it("дельта не записалась — шахта стоит, ключ не отмечен (дошлёт цикл)", async () => {
    s.recordFail = true;
    await expect(place({})).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
    expect(sentMarks()).toHaveLength(0);
    expect(s.published).toHaveLength(1);
  });

  it.each(["fail", "empty"] as const)("словарь %s — дельты нет, ключ ждёт досылки", async (d) => {
    s.dict = d;
    await expect(place({})).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
    expect(s.patches).toHaveLength(0);
    expect(sentMarks()).toHaveLength(0);
    expect(s.published).toHaveLength(1);
  });

  it("каменная шахта — под себя", async () => {
    const res = await place({ stackKey: "custom:cst_mine_bp_stone", dq: 0, dr: 0 });
    expect(res).toEqual({ ok: true, q: 10, r: 5, kind: "stone" });
    expect(placeSql()).toContain("SET building_id = 'building_IbP4EseH2O'");
    expect(placeSql()).toContain("na.mountains >= 3");
  });
});

describe("отказы до записи", () => {
  it("дальше соседней клетки — нельзя", async () => {
    await expect(place({ dq: 1, dr: 1 })).rejects.toThrow("mineplace.far");
    expect(placeSql()).toBe("");
  });

  // Золото и алмазы на жилу — mine-place-vein.test.ts.
  it("не заготовка, нет героя, купол", async () => {
    await expect(place({ stackKey: "custom:cst_apple" })).rejects.toThrow(
      "mineplace.not_blueprint",
    );
    await expect(place({ stackKey: "boss:b1" })).rejects.toThrow("mineplace.not_blueprint");
    s.hero = false;
    await expect(place({})).rejects.toThrow("market.backpack_no_hero");
    s.hero = true;
    s.voidCells = ["11,5"];
    await expect(place({})).rejects.toThrow("braid.void_blocked");
    expect(placeSql()).toBe("");
  });
});

describe("отказ оператора — понятный, без рассылки", () => {
  it("мало деревьев — с числами", async () => {
    s.row = { ...placedRow, placed: false, trees: 1, mountains: 6 };
    await expect(place({})).rejects.toThrow('mineplace.need_trees|{"n":1,"need":3}');
    expect(s.patches).toHaveLength(0);
    expect(s.published).toHaveLength(0);
  });

  it("на дороге и под чужим игроком", async () => {
    s.row = { ...placedRow, placed: false, road: true, trees: 3 };
    await expect(place({})).rejects.toThrow("mineplace.road");
    s.row = { ...placedRow, placed: false, player: true, trees: 3 };
    await expect(place({})).rejects.toThrow("mineplace.player");
  });
});

describe("повтор нажатия", () => {
  it("ответ потерялся после коммита — шахта уже стоит: ok, клетка из ключа, досылка", async () => {
    s.execError = "bridge timeout";
    s.opRow = { q: 9, r: 6 };
    await expect(place({})).resolves.toEqual({ ok: true, q: 9, r: 6, kind: "wood" });
    expect(s.patches[0]?.patches).toMatchObject([{ q: 9, r: 6 }]);
    expect(sentMarks()).toHaveLength(1);
    expect(s.published[0]).toMatchObject({ cells: ["9,6"], owner: true });
  });

  it("повтор уже разосланной постановки — второй рассылки нет", async () => {
    s.row = { was: true, placed: false, cell: true, box: false };
    s.opRow = { q: 11, r: 5, kind: "stone", sent: true };
    await expect(place({})).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "stone" });
    expect(s.patches).toHaveLength(0);
    expect(sentMarks()).toHaveLength(0);
    expect(s.published).toHaveLength(0);
  });

  it("ответ потерялся, а ключа нет — ошибка базы наружу", async () => {
    s.execError = "bridge timeout";
    await expect(place({})).rejects.toThrow("bridge timeout");
    expect(s.published).toHaveLength(0);
  });

  it("тот же ключ второй раз — оператор видит его, вторую шахту не ставит", async () => {
    s.row = { was: true, placed: false, cell: true, box: false };
    s.opRow = { q: 11, r: 5 };
    await expect(place({})).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
  });

  it("пустой ответ без ключа — занято", async () => {
    s.row = null;
    await expect(place({})).rejects.toThrow("mineplace.busy");
  });
});
