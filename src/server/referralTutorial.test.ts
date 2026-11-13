// SQL «прошёл обучение»: остров покинут порталом, связь кошелёк → аккаунт, кавычки экранированы.
import { describe, expect, it, vi } from "vitest";

vi.mock("./db/mcpClient", () => ({
  mcpExec: async (sql: string) => (sql.includes("'a.tg'") ? [{ wallet: "a.tg" }] : []),
}));

const { tutorialDoneSql, walletsWithTutorial } = await import("./referralTutorial");

describe("прошёл обучение", () => {
  it("засчитывает только выход порталом (finished_at), не пропуск", () => {
    const sql = tutorialDoneSql(["a.tg"]);
    expect(sql).toContain("i.finished_at IS NOT NULL");
    expect(sql).toContain("i.account_id = u.account_id");
    expect(sql).not.toContain("tutorial_skipped_at");
  });

  it("экранирует кавычки в адресе", () => {
    expect(tutorialDoneSql(["o'neil.tg"])).toContain("'o''neil.tg'");
  });

  it("пустой список — без запроса", async () => {
    expect((await walletsWithTutorial([])).size).toBe(0);
    expect([...(await walletsWithTutorial(["a.tg", "b.tg"]))]).toEqual(["a.tg"]);
  });
});
