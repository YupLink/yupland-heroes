// Окно «Подарки»: босс, снятый с охраны DARAI-шахты (minebag-02), — штучно
// «×1», с подписью «Охрана DARAI-шахты вернулась» на языке игрока и без срока
// (бессрочный подарок: строки «сгорит через» нет).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";
import type { MyGift } from "@/server/api/gifts";

const lang = vi.hoisted(() => ({ v: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.v,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.v] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/server/api/gifts", () => ({ claimGift: vi.fn(), claimAllGifts: vi.fn() }));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useResources", () => ({ RESOURCES_KEY: ["my-resources"] }));
vi.mock("./useHarvest", () => ({ GIFTS_KEY: ["my-gifts"] }));

const { GiftsModal } = await import("./GiftsModal");

const boss: MyGift = {
  id: "gft_1",
  kind: "boss",
  amount: 1,
  refId: "rbt_aJNyRPtX",
  title: "Глава Пиратов (75 Lv)",
  image: "/uploads/boss.webp",
  note: "dmine-guard:",
  createdAt: "2026-10-22T10:00:00Z",
  expiresAt: null,
};

const render = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <GiftsModal gifts={[boss]} onClose={() => {}} />
    </QueryClientProvider>,
  );

describe("подарок «босс» в окне подарков", () => {
  it("имя босса, ×1, подпись про охрану DARAI-шахты, без срока", () => {
    lang.v = "ru";
    const html = render();
    expect(html).toContain("Глава Пиратов (75 Lv)");
    expect(html).toContain("×1");
    expect(html).toContain("Охрана DARAI-шахты вернулась");
    expect(html).not.toContain("data-gift-expiry");
  });

  it("на английском — подпись по-английски", () => {
    lang.v = "en";
    expect(render()).toContain("Your DARAI mine guard is back");
  });
});
