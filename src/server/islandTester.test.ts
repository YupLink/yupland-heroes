// Тест острова без админки: админы + проверенный Telegram дизайнера (TEAM_DESIGNER_TG из env).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => null,
  getSessionTgId: () => null,
  isAdminWallet: (w: string | null) => w === "admin.near",
}));

const { isIslandTester } = await import("@/server/islandTester");

beforeEach(() => vi.stubEnv("TEAM_DESIGNER_TG", "700000003"));
afterEach(() => vi.unstubAllEnvs());

describe("isIslandTester", () => {
  it("админ — да, дизайнер по TG id — да, прочие — нет", () => {
    expect(isIslandTester("admin.near", null)).toBe(true);
    expect(isIslandTester("designer.tg", 700000003)).toBe(true);
    expect(isIslandTester("someone.near", 123)).toBe(false);
    expect(isIslandTester(null, 700000003)).toBe(false);
  });

  it("TEAM_DESIGNER_TG не задан — никого, кроме админов", () => {
    vi.stubEnv("TEAM_DESIGNER_TG", "");
    expect(isIslandTester("designer.tg", 700000003)).toBe(false);
    expect(isIslandTester("admin.near", null)).toBe(true);
  });

  it("тест-аккаунт прогонов — только парой кошелёк + Telegram, и не пилот", async () => {
    const { isIslandTutorialPilot } = await import("@/server/islandTester");
    expect(isIslandTester("tgtest_hw_1784407160136", 999000001)).toBe(true);
    expect(isIslandTester("tgtest_hw_1784407160136", 123)).toBe(false);
    expect(isIslandTester("someone.tg", 999000001)).toBe(false);
    expect(isIslandTutorialPilot(999000001)).toBe(false);
  });
});

describe("islandTesterAccess", () => {
  it("право island_tester у аккаунта — да, без права — нет, админ — да без запроса", async () => {
    vi.resetModules();
    vi.doMock("@/server/admin-rights", () => ({
      walletHasRight: async (w: string | null, r: string) => w === "tg4503599627370501" && r === "island_tester",
    }));
    const { islandTesterAccess } = await import("@/server/islandTester");
    expect(await islandTesterAccess("tg4503599627370501", 4503599627370501)).toBe(true);
    expect(await islandTesterAccess("someone.tg", 123)).toBe(false);
    expect(await islandTesterAccess(null, null)).toBe(false);
    expect(await islandTesterAccess("admin.near", null)).toBe(true);
    vi.doUnmock("@/server/admin-rights");
  });
});
