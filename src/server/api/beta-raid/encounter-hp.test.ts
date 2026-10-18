// Строка HP объекта клетки заводится первым ударом — под замком строки клетки
// (FOR KEY SHARE): перенос объекта (god-move) держит клетку FOR UPDATE, и удар
// по старому снимку не заведёт живую строку HP там, откуда объект уехал (иначе
// награда за неё выдалась бы второй раз). Беглецов не переносят — им замок не нужен.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [{ id: "brh_1", map_id: "rmap_x", q: 4, r: -2, object_id: "rbt_1", cycle_no: 0 }];
  },
}));

const { ensureObjectHp } = await import("@/server/api/beta-raid/encounter-hp");
const flat = (x: string) => x.replace(/\s+/g, " ").trim();
const target = { maxHp: 100 } as Parameters<typeof ensureObjectHp>[0]["target"];

beforeEach(() => {
  s.sql = [];
});

describe("первый удар: строка HP", () => {
  it("объект клетки — из клетки под FOR KEY SHARE, вставка из запертой строки", async () => {
    await ensureObjectHp({ mapId: "rmap_x", q: 4, r: -2, layer: 0, target });
    const ins = flat(s.sql[0]);
    expect(ins).toContain(
      "WITH c AS (SELECT c.object_id FROM yuplink.raid_map_cells c WHERE c.map_id = 'rmap_x' AND c.q = 4 AND c.r = -2 AND c.object_id IS NOT NULL FOR KEY SHARE OF c)",
    );
    expect(ins).toContain("FROM c ON CONFLICT (map_id, q, r, cycle_no) DO NOTHING;");
    expect(ins).toContain("'rmap_x', 4, -2, CASE WHEN c.object_id LIKE '%:%'");
  });

  it("беглец — из своего слоя, без замка клетки", async () => {
    await ensureObjectHp({ mapId: "rmap_x", q: 4, r: -2, layer: 1, target });
    const ins = flat(s.sql[0]);
    expect(ins).toContain("WITH c AS (SELECT c.object_id FROM yuplink.beta_raid_runner c WHERE");
    expect(ins).not.toContain("FOR KEY SHARE");
  });
});
