// Личное право «строить бесплатно»: разбор настройки, какие здания покрывает,
// что при сбое права нет; расстановка принимает покупные здания без покупки
// (кроме Аукциона и Архитектора); Ратуша не предлагает их купить; функция базы
// пускает к покупке шамана без настоящей хижины только из списка.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  setting: null as unknown,
  failSettings: false,
  bought: [] as string[],
  sql: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.settings")) {
      if (s.failSettings) throw new Error("bridge down");
      return s.setting === null ? [] : [{ value: s.setting }];
    }
    const kind = /AND kind = '([^']*)'/.exec(sql)?.[1] ?? "";
    return [{ owned: s.bought.includes(kind) }];
  },
}));
vi.mock("@/server/auth", () => ({ isAdminWallet: () => false, isCastleEditor: () => false }));
vi.mock("@/server/db/pg", () => ({ pg: { users: { findOne: async () => null } } }));
vi.mock("@/server/api/castle-townhall/townhall-state", () => ({
  who: async () => ({ wallet: "w", account: "acc_me" }),
  loadTownHall: async () => ({
    level: 1,
    purchased: 0,
    buildings: [],
    legacy: { casino: false, auction: false, architect: false },
    decor: [],
    resources: {},
  }),
}));

const fb = await import("./free-build");
const { layoutOwnership } = await import("../castle-layout/castle-layout");
const { layoutRightsProblem } = await import("../castle-layout/layout-rights");

const ME = "acc_me";
const grant = (accounts: string[]) => {
  s.setting = JSON.stringify({ accounts });
};
const item = (id: string) => ({
  id,
  x: 400,
  y: 700,
  size: 220,
  caption: { x: 0, y: -8, font: 12, height: 23 },
  captionHidden: false,
  mirrored: false,
});

beforeEach(() => {
  Object.assign(s, { setting: null, failSettings: false, bought: [], sql: [] });
  fb.dropFreeBuildCache();
});

describe("parseFreeBuild", () => {
  it("строка JSON и объект; чужое и мусор — мимо", () => {
    expect([...fb.parseFreeBuild('{"accounts":["acc_a","x",1]}')]).toEqual(["acc_a"]);
    expect([...fb.parseFreeBuild({ accounts: ["acc_b"] })]).toEqual(["acc_b"]);
    expect(fb.parseFreeBuild("{не json").size).toBe(0);
    expect(fb.parseFreeBuild(null).size).toBe(0);
    expect(fb.parseFreeBuild({ accounts: "acc_a" }).size).toBe(0);
  });
});

describe("hasCastleBuilding", () => {
  it("по праву — построено без запроса к castle_building", async () => {
    grant([ME]);
    expect(await fb.hasCastleBuilding(ME, "weather_station")).toBe(true);
    expect(await fb.hasCastleBuilding(ME, "shaman_hut")).toBe(true);
    expect(s.sql.some((q) => q.includes("castle_building"))).toBe(false);
  });
  it("Храм, Аукцион и Архитектор право не покрывает", async () => {
    grant([ME]);
    for (const k of ["temple", "auction", "architect"]) {
      expect(await fb.freeBuildCovers(ME, k)).toBe(false);
      expect(await fb.hasCastleBuilding(ME, k)).toBe(false);
    }
  });
  it("без права — только купленное", async () => {
    grant(["acc_other"]);
    s.bought = ["mine_office"];
    expect(await fb.hasCastleBuilding(ME, "mine_office")).toBe(true);
    expect(await fb.hasCastleBuilding(ME, "weather_station")).toBe(false);
  });
  it("настройка не прочиталась — права нет", async () => {
    s.failSettings = true;
    expect(await fb.hasFreeBuild(ME)).toBe(false);
    expect(await fb.hasCastleBuilding(ME, "shaman_hut")).toBe(false);
  });
});

describe("расстановка замка", () => {
  it("по праву покупные здания проходят, Аукцион и Архитектор — нет", async () => {
    grant([ME]);
    const own = await layoutOwnership("w", ME);
    const layout = ["casino", "mine_office", "weather_station", "shaman_hut"].map(item);
    expect(layoutRightsProblem([item("hall"), ...layout], own)).toBeNull();
    expect(layoutRightsProblem([item("auction")], own)?.message).toBe(
      'castle.layout_not_owned|{"id":"auction"}',
    );
    expect(layoutRightsProblem([item("architect")], own)?.message).toBe(
      'castle.layout_not_owned|{"id":"architect"}',
    );
  });
  it("без права — как раньше", async () => {
    const own = await layoutOwnership("w", ME);
    expect(layoutRightsProblem([item("weather_station")], own)?.message).toBe(
      'castle.layout_not_owned|{"id":"weather_station"}',
    );
  });
});

describe("миграция shaman-03-free-build", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../../migrations/shaman-03-free-build.sql", import.meta.url)),
    "utf8",
  );
  it("право проверяется только без настоящей хижины, вложенным IF", () => {
    expect(sql).toMatch(
      /IF NOT EXISTS \(SELECT 1 FROM yuplink\.castle_building b[\s\S]*?THEN\s+IF NOT COALESCE\([\s\S]*?'castle_free_build'[\s\S]*?\? p_account,\s+false\) THEN\s+RAISE EXCEPTION 'shaman_no_hut';/,
    );
  });
  it("одной транзакцией, настройку не перезаписывает, ничего не удаляет", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING;/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE yuplink)\b/);
  });
});
