// Переключатели «Игроки на карте» / «Юпики в замке» в профиле: включены, пока
// игрок их не выключил; выключенный на аккаунте — выключен. ru и en.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountView } from "@/server/api/account-view";

vi.mock("@/server/api/user-auth", () => ({ getSession: () => new Promise(() => {}) }));
vi.mock("@/server/api/account-view", () => ({
  DEFAULT_VIEW: { hidePlayers: false, hideResidents: false },
  getAccountView: () => new Promise(() => {}),
  setAccountView: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { ProfileViewToggles } = await import("./ProfileViewToggles");

function render(view: AccountView | null, ru = true): string {
  const qc = new QueryClient();
  qc.setQueryData(["session"], { wallet: "player.tg" });
  if (view) qc.setQueryData(["account-view", "player.tg"], view);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ProfileViewToggles ru={ru} />
    </QueryClientProvider>,
  );
}

const checked = (html: string, label: string) => {
  const row = html.split("<button").find((b) => b.includes(label));
  return row?.match(/aria-checked="(true|false)"/)?.[1];
};

describe("ProfileViewToggles", () => {
  it("по умолчанию всё видно", () => {
    const html = render(null);
    expect(checked(html, "Игроки на карте")).toBe("true");
    expect(checked(html, "Юпики в замке")).toBe("true");
  });

  it("выключенное на аккаунте — выключено, второе не трогает", () => {
    const html = render({ hidePlayers: true, hideResidents: false });
    expect(checked(html, "Игроки на карте")).toBe("false");
    expect(checked(html, "Юпики в замке")).toBe("true");
  });

  it("по-английски", () => {
    const html = render({ hidePlayers: false, hideResidents: true }, false);
    expect(checked(html, "Players on map")).toBe("true");
    expect(checked(html, "Yupiks in castle")).toBe("false");
  });
});
