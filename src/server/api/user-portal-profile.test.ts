// Выбор профиля портала, когда их несколько (жалоба 08.10.2026: «на портале и
// в YupLink один кошелёк, а пишет — связь не найдена»).
import { describe, expect, it } from "vitest";
import { pickPortalProfile } from "@/server/api/user-portal-profile";

const SISTERS = ["player1.tg", "player2.tg", "player3.tg", "player4.tg"];
const rows = [
  { near_account_id: "player2.tg", energy_balance: 135, id: "p-2" },
  { near_account_id: "player1.tg", energy_balance: 497284, id: "p-1" },
  { near_account_id: "player3.tg", energy_balance: 380, id: "p-3" },
];

describe("профиль портала при нескольких кошельках", () => {
  it("берёт профиль активного кошелька, а не первый попавшийся", () => {
    expect(pickPortalProfile(rows, "player3.tg", SISTERS)?.id).toBe("p-3");
    expect(pickPortalProfile(rows, "player1.tg", SISTERS)?.id).toBe("p-1");
  });

  it("активного профиля нет — берёт самый живой (по энергии)", () => {
    expect(pickPortalProfile(rows, "player4.tg", SISTERS)?.id).toBe("p-1");
  });

  it("все пустые — берёт первый по порядку кошельков", () => {
    const empty = rows.map((r) => ({ ...r, energy_balance: 0 }));
    expect(pickPortalProfile(empty, "player4.tg", SISTERS)?.id).toBe("p-1");
  });

  it("профилей нет — null", () => {
    expect(pickPortalProfile([], "player1.tg", SISTERS)).toBeNull();
  });

  it("один профиль — он и есть ответ, чей бы кошелёк ни был активным", () => {
    const one = [rows[0]];
    expect(pickPortalProfile(one, "player1.tg", SISTERS)?.id).toBe("p-2");
  });
});
