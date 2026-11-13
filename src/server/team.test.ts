// Команда проекта из env: пусто — «никого», деньги на пустой кошелёк не уходят.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireTeamWallet,
  teamDesignerAccount,
  teamDesignerTg,
  teamDesignerTgUsername,
  teamOwnerTg,
  teamOwnerWallet,
  teamPartnerTg,
  teamPartnerWallet,
  teamTgIds,
  teamWallet,
  teamWalletTag,
} from "./team";

afterEach(() => vi.unstubAllEnvs());

function stubAll(v: string) {
  for (const k of [
    "TEAM_OWNER_WALLET",
    "TEAM_PARTNER_WALLET",
    "TEAM_OWNER_TG",
    "TEAM_PARTNER_TG",
    "TEAM_DESIGNER_TG",
    "TEAM_DESIGNER_TG_USERNAME",
    "TEAM_DESIGNER_ACCOUNT",
  ]) {
    vi.stubEnv(k, v);
  }
}

describe("команда из env", () => {
  it("значения читаются при каждом вызове, с обрезкой пробелов", () => {
    vi.stubEnv("TEAM_OWNER_WALLET", " owner.tg ");
    vi.stubEnv("TEAM_PARTNER_WALLET", "partner.tg");
    vi.stubEnv("TEAM_OWNER_TG", "700000001");
    vi.stubEnv("TEAM_PARTNER_TG", "700000002");
    vi.stubEnv("TEAM_DESIGNER_TG", "700000003");
    vi.stubEnv("TEAM_DESIGNER_TG_USERNAME", "designer_tg");
    vi.stubEnv("TEAM_DESIGNER_ACCOUNT", "acc_designer_test");
    expect(teamOwnerWallet()).toBe("owner.tg");
    expect(teamPartnerWallet()).toBe("partner.tg");
    expect(teamWallet("owner")).toBe("owner.tg");
    expect(teamWalletTag("partner")).toBe("partner");
    expect(teamOwnerTg()).toBe(700000001);
    expect(teamPartnerTg()).toBe(700000002);
    expect(teamDesignerTg()).toBe(700000003);
    expect(teamDesignerTgUsername()).toBe("designer_tg");
    expect(teamDesignerAccount()).toBe("acc_designer_test");
    expect(requireTeamWallet("partner")).toBe("partner.tg");
    vi.stubEnv("TEAM_OWNER_WALLET", "other.tg");
    expect(teamOwnerWallet()).toBe("other.tg");
  });

  it("не задано — пусто, null и ошибка для денег", () => {
    stubAll("");
    expect(teamOwnerWallet()).toBe("");
    expect(teamPartnerWallet()).toBe("");
    expect(teamOwnerTg()).toBeNull();
    expect(teamDesignerTgUsername()).toBe("");
    expect(teamDesignerAccount()).toBe("");
    expect(teamTgIds(teamOwnerTg(), teamPartnerTg(), teamDesignerTg())).toEqual([]);
    expect(() => requireTeamWallet("owner")).toThrow("TEAM_OWNER_WALLET не задан");
    expect(() => requireTeamWallet("partner")).toThrow("TEAM_PARTNER_WALLET не задан");
  });

  it("мусор вместо Telegram id — null; список id без пустых, порядок сохранён", () => {
    vi.stubEnv("TEAM_OWNER_TG", "abc");
    vi.stubEnv("TEAM_PARTNER_TG", "-5");
    vi.stubEnv("TEAM_DESIGNER_TG", "1.5");
    expect(teamOwnerTg()).toBeNull();
    expect(teamPartnerTg()).toBeNull();
    expect(teamDesignerTg()).toBeNull();
    expect(teamTgIds(2, null, 1)).toEqual([2, 1]);
  });
});
