// Награда дропа «Товар» в интерфейсе: вкладка в переключателе, выбор товара
// картинками (имя и картинка уходят в ярус), карточка дропа у игрока.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/server/api/beta-raid/market-custom", () => ({ listCustomItems: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k, useLang: () => "ru" }));

const { KindToggle } = await import("./KindToggle");
const { GoodsPicker } = await import("./GoodsPicker");
const { TiersBreakdown } = await import("@/components/drops/shop-shared");

const html = (node: ReactNode) => {
  const qc = new QueryClient();
  qc.setQueryData(["custom-items"], [{ id: "cst_torch", name: "Факел", image: "https://x/torch.webp" }]);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

describe("награда «Товар»", () => {
  it("вкладка «Товар» рядом с энергией", () => {
    expect(html(<KindToggle value="custom" onChange={() => {}} />)).toContain("Товар");
  });
  it("сетка товаров с выбранным", () => {
    const out = html(<GoodsPicker itemId="cst_torch" onPick={() => {}} />);
    expect(out).toContain("Факел");
  });
  it("карточка дропа: картинка, имя и сколько штук", () => {
    const out = html(
      <TiersBreakdown
        tiers={[{ weight: 100, kind: "custom", rewardMin: 1, rewardMax: 3, rewardToken: "custom", itemName: "Факел", itemImage: "https://x/torch.webp" }]}
      />,
    );
    expect(out.replace(/<!-- -->/g, "")).toContain("Факел ×1–3");
    expect(out).toContain("<img");
  });
});
