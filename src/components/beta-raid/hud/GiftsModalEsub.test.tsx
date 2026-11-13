// Окно «Подарки»: начисление по подписке (владелец 25.10.2026) — «Начисление по
// подписке «…»» и срок «только сегодня» вместо «сгорит через N ч»; под заголовком —
// без «48 часов». Обычный подарок — прежний срок.
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

const soon = Date.now() + 7 * 3_600_000 + 60_000;
const esub: MyGift = {
  id: "gft_s",
  kind: "energy",
  amount: 7000,
  refId: null,
  title: null,
  image: null,
  note: "esub:Эксперт|Expert",
  createdAt: "2026-10-25T00:00:00Z",
  expiresAt: soon,
} as unknown as MyGift;
const plain = { ...esub, id: "gft_p", note: null } as MyGift;

const render = (gifts: MyGift[]) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <GiftsModal gifts={gifts} onClose={() => {}} />
    </QueryClientProvider>,
  );

describe("начисление по подписке в окне подарков", () => {
  it("«Начисление по подписке» и «только сегодня»; без 48 часов", () => {
    lang.v = "ru";
    const html = render([esub]);
    expect(html).toContain("Начисление по подписке «Эксперт»");
    expect(html).toContain("только сегодня");
    expect(html).not.toContain("сгорит через");
    expect(html).not.toContain("48");
  });

  it("на английском", () => {
    lang.v = "en";
    const html = render([esub]);
    expect(html).toContain("“Expert” subscription accrual");
    expect(html).toContain("today only");
  });

  it("обычный подарок — «сгорит через N ч», как было", () => {
    lang.v = "ru";
    expect(render([plain])).toMatch(/сгорит через [67] ч/);
  });
});
