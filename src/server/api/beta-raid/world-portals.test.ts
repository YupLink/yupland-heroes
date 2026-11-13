// Межмировые порталы (29.10.2026): межмировой — по ВЫХОДАМ, а не по targetMap
// (это карта комнаты); дверь, внутримировые и закрытый этаж — мимо; остров ведёт
// в основной мир; игроку — только разведанные входы не под глухим туманом,
// «Вся карта» — по правам подробной; выходов в ответе нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  admin: false,
  has: false,
  map: "alpha",
  seen: [] as string[],
  island: null as null | { mapId: string; back: { mapId: string; q: number; r: number } | null },
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/auth", () => ({
  isAdminWallet: () => s.admin,
  isPayoutsAdminWallet: () => false,
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./world-map-item", () => ({ hasMapItem: async () => s.has }));
vi.mock("./encounter-where", () => ({
  playerMapId: async () => s.map,
  activeBetaMapId: async () => "alpha",
}));
vi.mock("./island/island-row", () => ({ loadIsland: async () => s.island }));

// Связки с прода 29.10.2026 (id карт короче): Альфа ↔ четыре этажа по одной паре.
const P = (map: string, q: number, r: number, group: string | null, tm?: string, v = false) => ({
  map_id: map,
  q,
  r,
  portal: group === null ? null : { group, ...(tm ? { targetMap: tm } : {}) },
  grp: group,
  room_map: tm || map,
  void_fog: v,
  block: null as string | null,
});
const NET = [
  P("alpha", 32, 65, "1", "builders"),
  P("builders", 16, 32, "1", "builders"), // targetMap = своя карта, а ведёт в Альфу
  // Блок режима бога из двух клеток: постройка на 62,59 (на проде с 30.10 так стоят все межмировые).
  { ...P("alpha", 62, 59, "53", "akania"), block: "63,58;62,59" },
  P("akania", 50, 45, "53"), // targetMap нет, а ведёт в Альфу
  P("alpha", 10, 10, "1"), // комната (Альфа, 1) — внутри мира
  P("alpha", 11, 11, "1"),
  P("alpha", 12, 12, "0"), // дверь
  P("alpha", 13, 13, null), // без настройки — тоже дверь
  P("alpha", 40, 40, "7", "closed"), // этаж закрыт — никуда
  P("alpha", 50, 50, "9", "", true), // под глухим туманом
  P("akania", 5, 5, "9", "alpha"),
];
const NAMES = [
  { id: "alpha", name: "Мир Альфа" },
  { id: "builders", name: "Мир строителей" },
  { id: "akania", name: "Акания" },
];

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("beta_raid_fog_seen")) {
      return s.seen.filter((c) => sql.includes(`'${c}'`)).map((cell) => ({ cell }));
    }
    if (sql.includes("COALESCE(f.name, m.name)")) return NAMES;
    if (sql.includes("c.map_id = 'isle_me'")) return [P("isle_me", 3, 4, "1")];
    return NET;
  },
}));

const { crossWorldPortals } = await import("./world-portals-net");
const { getWorldPortals } = await import("./world-portals");
type Out = { mapId: string; portals: Array<{ q: number; r: number; to: string[] }> };
const call = (mode?: "seen" | "all") =>
  (getWorldPortals as unknown as (a: { data: { mode: string } }) => Promise<Out>)({
    data: { mode: mode ?? "seen" },
  });
const at = (o: Out) => o.portals.map((p) => `${p.q},${p.r}→${p.to.join("+")}`);

beforeEach(() => {
  Object.assign(s, { admin: false, has: false, map: "alpha", seen: [], island: null, sql: [] });
});

describe("crossWorldPortals", () => {
  const live = new Set(["alpha", "builders", "akania"]);
  const net = crossWorldPortals(NET, live);
  const keys = (m: string) => (net.get(m) ?? []).map((p) => `${p.q},${p.r}→${p.to.join("+")}`);

  it("межмировой — по выходам: обе стороны каждой пары, targetMap не направление", () => {
    expect(keys("alpha")).toEqual(["32,65→builders", "62,59→akania", "50,50→akania"]);
    expect(keys("builders")).toEqual(["16,32→alpha"]);
    expect(keys("akania")).toEqual(["50,45→alpha", "5,5→alpha"]);
  });
  it("внутримировые, двери и закрытый этаж — не межмировые", () => {
    for (const k of ["10,10", "11,11", "12,12", "13,13", "40,40"]) {
      expect(keys("alpha").some((x) => x.startsWith(k))).toBe(false);
    }
  });
  it("сеть, ведущая и в свой мир, — alsoHere", () => {
    const mixed = crossWorldPortals([...NET, P("alpha", 70, 70, "1", "builders")], live);
    const p = mixed.get("alpha")?.find((x) => x.q === 32);
    expect(p).toMatchObject({ to: ["builders"], alsoHere: true });
  });
});

describe("getWorldPortals", () => {
  it("игроку без «Карты» — только разведанные входы, без тумана-купола, с именами миров", async () => {
    s.seen = ["32,65", "50,50", "10,10"];
    const out = await call();
    expect(out.mapId).toBe("alpha");
    expect(at(out)).toEqual(["32,65→Мир строителей"]);
    // Выходов нет ни в ответе, ни в вопросе к туману.
    expect(JSON.stringify(out)).not.toMatch(/16|32,32|50,45/);
  });
  it("блок виден по любой своей клетке — отдаём разведанную, не клетку постройки", async () => {
    s.seen = ["63,58"];
    expect(at(await call())).toEqual(["63,58→Акания"]);
    s.seen = ["62,59", "63,58"];
    expect(at(await call())).toEqual(["62,59→Акания"]);
    s.seen = ["64,58"];
    expect(at(await call())).toEqual([]);
  });
  it("с другой стороны пары — назад в Альфу", async () => {
    s.map = "builders";
    s.seen = ["16,32"];
    expect(at(await call())).toEqual(["16,32→Мир Альфа"]);
  });
  it("остров — в основной мир; админ на тесте — туда, откуда пришёл", async () => {
    s.map = "isle_me";
    s.seen = ["3,4"];
    s.island = { mapId: "isle_me", back: null };
    expect(at(await call())).toEqual(["3,4→Мир Альфа"]);
    s.island = { mapId: "isle_me", back: { mapId: "akania", q: 1, r: 1 } };
    expect(at(await call())).toEqual(["3,4→Акания"]);
  });
  it("«Вся карта» — только с правами подробной карты", async () => {
    await expect(call("all")).rejects.toThrow("wmap.no_access");
    s.admin = true;
    await expect(call("all")).rejects.toThrow("wmap.no_access");
    s.has = true;
    expect(at(await call("all"))).toEqual(["32,65→Мир строителей", "62,59→Акания", "50,50→Акания"]);
  });
});
