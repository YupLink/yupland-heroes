// Молитва: кнопка не гаснет без выбора — нажатие подсказывает выбрать бонус.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/server/api/castle-temple", () => ({ prayCastleTemple: vi.fn() }));
const { TemplePrayer } = await import("./TemplePrayer");

const points = { atk: 1, arm: 1, hp: 1, spd: 1, luck: 1, int: 1, trade: 1, alchemy: 1 };

describe("молитва в храме", () => {
  it("ничего не выбрано — «Помолиться» активна", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TemplePrayer ru points={points as never} slots={2} prayAt={null} atCastle extendStars={100} />
      </QueryClientProvider>,
    );
    const last = html.slice(html.lastIndexOf("<button"));
    expect(last).toContain("Помолиться");
    expect(last).not.toContain('disabled=""');
  });
});
