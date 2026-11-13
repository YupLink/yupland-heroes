// Строка «Привязать в Telegram» в профиле вошедшего по кошельку: только ссылка на
// игру в Telegram — без ссылки на бота, которую мог бы нажать чужой человек.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations/wallet-login";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => dict[key]?.ru ?? key }));

const { LinkTelegramRow, GAME_IN_TELEGRAM } = await import("./LinkTelegramRow");

describe("привязка Telegram из профиля", () => {
  it("ведёт в игру в Telegram, а не в бот-привязку", () => {
    const html = renderToStaticMarkup(<LinkTelegramRow />);
    expect(html).toContain("Привязать в Telegram");
    expect(html).toContain(GAME_IN_TELEGRAM);
    expect(html).not.toContain("start=auth_");
  });
});
