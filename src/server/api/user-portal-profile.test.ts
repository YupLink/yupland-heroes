// Выбор профиля портала, когда их несколько (жалоба 08.10.2026: «на портале и
// в YupLink один кошелёк, а пишет — связь не найдена»).
import { describe, expect, it } from "vitest";
import { pickPortalProfile } from "@/server/api/user-portal-profile";

const SISTERS = ["player57.tg", "player58.tg", "player59.tg", "player60.tg"];
const rows = [
  { near_account_id: "player58.tg", energy_balance: 135, id: "p-tlen" },
  { near_account_id: "player57.tg", energy_balance: 497284, id: "p-dead" },
  { near_account_id: "player59.tg", energy_balance: 380, id: "p-kvad" },
];

describe("профиль портала при нескольких кошельках", () => {
  it("берёт профиль активного кошелька, а не первый попавшийся", () => {
    expect(pickPortalProfile(rows, "player59.tg", SISTERS)?.id).toBe("p-kvad");
    expect(pickPortalProfile(rows, "player57.tg", SISTERS)?.id).toBe("p-dead");
  });

  it("активного профиля нет — берёт самый живой (по энергии)", () => {
    expect(pickPortalProfile(rows, "player60.tg", SISTERS)?.id).toBe("p-dead");
  });

  it("все пустые — берёт первый по порядку кошельков", () => {
    const empty = rows.map((r) => ({ ...r, energy_balance: 0 }));
    expect(pickPortalProfile(empty, "player60.tg", SISTERS)?.id).toBe("p-dead");
  });

  it("профилей нет — null", () => {
    expect(pickPortalProfile([], "player57.tg", SISTERS)).toBeNull();
  });

  it("один профиль — он и есть ответ, чей бы кошелёк ни был активным", () => {
    const one = [rows[0]];
    expect(pickPortalProfile(one, "player57.tg", SISTERS)?.id).toBe("p-tlen");
  });
});
