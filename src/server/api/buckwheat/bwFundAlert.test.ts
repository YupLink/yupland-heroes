// Фонд игры кончился и выплату добрал пул карты — сообщение владельцу, партнёру и
// дизайнеру (TG id из env, не чаще раза в час); пул карты не трогали — молчим.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  mapRow: null as null | { from_map: number; map_total: number },
  claimed: true,
  sent: [] as Array<{ id: number; text: string }>,
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("crown_fund_alert_at")) return s.claimed ? [{ key: "x" }] : [];
    return s.mapRow ? [s.mapRow] : [];
  },
}));
vi.mock("../../tg", () => ({
  tgSendMessage: async (id: number, text: string) => (s.sent.push({ id, text }), true),
}));

const { alertFundIfShort, fundAlertTg } = await import("./bwFundAlert");

beforeEach(() => {
  Object.assign(s, { mapRow: null, claimed: true, sent: [] });
  vi.stubEnv("TEAM_OWNER_TG", "700000001");
  vi.stubEnv("TEAM_PARTNER_TG", "700000002");
  vi.stubEnv("TEAM_DESIGNER_TG", "700000003");
});
afterEach(() => vi.unstubAllEnvs());

describe("сообщение «баланс игры Кайлани ушёл в минус»", () => {
  it("выплата целиком из фонда — молчим", async () => {
    await alertFundIfShort("bw_a");
    expect(s.sent).toEqual([]);
  });

  it("добрал пул карты — пишем троим, с суммами", async () => {
    s.mapRow = { from_map: 50000, map_total: 150000 };
    await alertFundIfShort("bw_a");
    expect(s.sent.map((m) => m.id)).toEqual(fundAlertTg());
    expect(fundAlertTg()).toEqual([700000001, 700000002, 700000003]);
    expect(s.sent[0].text).toContain("ушёл в минус");
    expect(s.sent[0].text).toMatch(/50\s000 DARAI/);
  });

  it("уже писали в этот час — не повторяем", async () => {
    s.mapRow = { from_map: 50000, map_total: 150000 };
    s.claimed = false;
    await alertFundIfShort("bw_a");
    expect(s.sent).toEqual([]);
  });

  it("незаданный в env получатель выпадает, остальным пишем", async () => {
    vi.stubEnv("TEAM_PARTNER_TG", "");
    s.mapRow = { from_map: 50000, map_total: 150000 };
    await alertFundIfShort("bw_a");
    expect(s.sent.map((m) => m.id)).toEqual([700000001, 700000003]);
  });
});
