// В газету — только скрин живого клада (владелец 07.11.2026): ни мира, ни приза, ни нашедшего.
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: "", rows: [] as unknown[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => ((s.sql = sql), s.rows),
}));

const { latestTreasure } = await import("./treasure-news");

describe("клад в API газеты", () => {
  it("только ссылка на скрин живого клада", async () => {
    s.rows = [{ id: "trs_abc123" }];
    expect(await latestTreasure()).toEqual({
      image: "https://service.yupland.io/api/news?image=treasure&id=trs_abc123",
    });
    expect(s.sql).toContain("status = 'live'");
    expect(s.sql).not.toMatch(/map_id|found_by|resource|amount/);
  });

  it("клада нет — null", async () => {
    s.rows = [];
    expect(await latestTreasure()).toBeNull();
  });
});
