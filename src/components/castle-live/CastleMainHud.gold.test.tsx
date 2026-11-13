// Шапка замка: золото с иконкой игры, всегда коротко K/M, полное число — в
// подписи; рядом «+» покупки золота (§8.66, приёмка Ангелины: 125 000 и миллион).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const st = vi.hoisted(() => ({ gold: 125_000 as number | undefined }));

vi.mock("@/lib/hooks/useResources", () => ({
  RESOURCES_KEY: ["my-resources"],
  useResources: () => ({
    data: st.gold == null ? undefined : { gold: st.gold, wood: 0, stone: 0, diamonds: 0 },
    isPending: st.gold == null,
    isError: false,
  }),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({
  useEnergy: () => ({ data: { energy: 80, maxEnergy: 100, nextRegenSec: 0 }, isPending: false, dataUpdatedAt: 0 }),
}));
vi.mock("@/server/api/likes", () => ({ myLikeBalance: async () => ({ available: 12 }) }));
vi.mock("@/server/api/user-auth", () => ({ getSession: async () => ({ wallet: "w1.near" }) }));
vi.mock("@/server/api/beta-raid", () => ({ getBetaRaidState: async () => ({}) }));
vi.mock("@/components/beta-raid/CastleEffectsStrip", () => ({ CastleEffectsStrip: () => null }));
vi.mock("./CastleLikesInfo", () => ({ CastleLikesInfo: () => null }));
vi.mock("./castle-main-hud.css", () => ({}));

const { CastleMainHud } = await import("./CastleMainHud");

const render = (ru = true) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CastleMainHud ru={ru} />
    </QueryClientProvider>,
  );

describe("золото в шапке замка", () => {
  it("иконка игры, 125K на виду, полное число в подписи, «+» покупки", () => {
    st.gold = 125_000;
    const html = render();
    expect(html).toContain('src="/resources/gold.webp"');
    expect(html).toContain(">125K<");
    expect(html).toContain('aria-label="125 000"'.replace(" ", " "));
    expect(html).toContain('aria-label="Купить золото"');
    expect(html).toContain('aria-label="Купить энергию"');
  });

  it("миллион — 1M, по-английски полное число с запятой", () => {
    st.gold = 1_000_000;
    const html = render(false);
    expect(html).toContain(">1M<");
    expect(html).toContain('aria-label="1,000,000"');
    expect(html).toContain('aria-label="Buy gold"');
  });

  it("золото ещё грузится — многоточие, без числа", () => {
    st.gold = undefined;
    const html = render();
    expect(html).toContain("Золото");
    expect(html).not.toContain(">0<");
  });
});
