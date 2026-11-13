// Метки ассетов на сервере: природа декора (дерево/гора, §8.59.8) читается и до
// миграции (to_jsonb — без колонки чтение не падает), пишется галочкой админа
// только у декора и только когда пришла.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));

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
    return /FROM yuplink.raid_asset_tags t/.test(sql) ? s.rows : [];
  },
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => "w_admin",
  isAdminWallet: () => true,
}));
vi.mock("@/server/api/beta-raid/zonegen/affinity", () => ({ dropAffinityCache: () => {} }));
vi.mock("@/server/api/beta-raid/zonegen/catalog-buildings", () => ({
  dropBuildingCatalogCache: () => {},
}));

const { adminSetAssetTags, dropAssetTagsCaches, loadAssetTags } = await import("./asset-tags");
const set = (data: Record<string, unknown>) =>
  (adminSetAssetTags as unknown as Fn)({
    data: { refId: "decoration_oak", kind: "decoration", terrains: [], races: [], ...data },
  });
const upsert = () => s.sql.find((x) => x.includes("INSERT INTO yuplink.raid_asset_tags")) ?? "";

beforeEach(async () => {
  await dropAssetTagsCaches();
  s.sql.length = 0;
  s.rows = [];
});

describe("чтение", () => {
  it("природа — через to_jsonb; мусор — без метки", async () => {
    s.rows = [
      { ref_id: "d1", terrains: [], races: [], auto: true, nature: "tree" },
      { ref_id: "d2", terrains: [], races: [], auto: false, nature: "lake" },
      { ref_id: "d3", terrains: ["t1"], races: [], auto: true },
    ];
    const tags = await loadAssetTags();
    expect(s.sql[0]).toContain("to_jsonb(t)->>'nature' AS nature");
    expect(tags.get("d1")?.nature).toBe("tree");
    expect(tags.get("d2")?.nature).toBeNull();
    expect(tags.get("d3")).toEqual({ terrains: ["t1"], races: [], auto: true, nature: null });
  });
});

describe("галочка админа", () => {
  it("гора у декора — пишется колонкой", async () => {
    const res = await set({ nature: "mountain" });
    expect(upsert()).toContain("auto, updated_at, nature)");
    expect(upsert()).toContain("false, now(), 'mountain')");
    expect(upsert()).toContain("nature = EXCLUDED.nature");
    expect(res).toMatchObject({ tags: { nature: "mountain", auto: false } });
  });

  it("снять — NULL", async () => {
    await set({ nature: null });
    expect(upsert()).toContain("false, now(), NULL)");
  });

  it("не прислали — колонку не трогаем", async () => {
    const res = await set({});
    expect(upsert()).not.toContain("nature");
    expect(res).not.toHaveProperty("tags.nature");
  });

  it("у постройки природы не бывает; чужое значение — отказ", async () => {
    await set({ refId: "building_x", kind: "building", nature: "tree" });
    expect(upsert()).not.toContain("nature");
    await expect(set({ nature: "lake" })).rejects.toThrow();
  });
});
