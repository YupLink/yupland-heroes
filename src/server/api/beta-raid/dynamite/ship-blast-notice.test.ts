// Окно «корабль подорвали» (§8.75а): запись идемпотентна по броску и аккаунту,
// выдача — только своих непоказанных, «Понятно» гасит только свои.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("@/server/auth", () => ({ getCurrentWallet: vi.fn() }));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: vi.fn() }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: vi.fn() }));

const { noteShipBlastSql, unseenSql, markSeenSql } = await import("./ship-blast-notice");

describe("ship_blast_notice SQL", () => {
  it("запись: id от броска и аккаунта, повтор не задвоит", () => {
    const sql = noteShipBlastSql("op1", "acc_1", "map_a", { q: 3.7, r: -2 });
    expect(sql).toContain("md5('op1:acc_1')");
    expect(sql).toContain("'acc_1', 'map_a'");
    expect(sql).toContain("3, -2");
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("кавычки в ключах экранированы", () => {
    expect(noteShipBlastSql("o'p", "a'b", "m", { q: 0, r: 0 })).toContain("'a''b'");
  });

  it("выдача — свои непоказанные", () => {
    const sql = unseenSql("acc_1");
    expect(sql).toContain("account_id = 'acc_1'");
    expect(sql).toContain("shown_at IS NULL");
  });

  it("«Понятно» — только свои, без дублей; пусто — без запроса", () => {
    const sql = markSeenSql("acc_1", ["sbn_a", "sbn_a", "sbn_b"]);
    expect(sql).toContain("account_id = 'acc_1'");
    expect(sql).toContain("IN ('sbn_a','sbn_b')");
    expect(markSeenSql("acc_1", [])).toBeNull();
  });
});
