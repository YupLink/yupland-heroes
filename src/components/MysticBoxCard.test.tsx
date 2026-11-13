// Кнопка «Открыть все» на карточке стака: только Bonus Box при N ≥ 2;
// «Все ×N» при N ≤ 50, иначе «Открыть 50». Одиночное «Открыть» — всегда.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REF_BOX_PACK_ID } from "@/lib/referralRewards";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (k: string, p?: Record<string, unknown>) => (p ? `${k}${JSON.stringify(p)}` : k),
}));
vi.mock("@/server/api/mystic", () => ({ openMysticBox: vi.fn(), openMysticBoxes: vi.fn() }));
vi.mock("@/lib/query", () => ({ invalidateHeroQueries: vi.fn() }));

const { MysticBoxCard } = await import("./MysticBoxCard");

const card = (packId: string, count: number) => {
  const g = {
    grantId: "g1",
    packId,
    packName: "Bonus Box",
    coverImageUrl: null,
    opened: false,
    prize: null,
    grantedAt: null,
    source: null,
  } as unknown as Parameters<typeof MysticBoxCard>[0]["g"];
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MysticBoxCard g={g} count={count} onReveal={() => {}} />
    </QueryClientProvider>,
  );
};

describe("MysticBoxCard — «Открыть все»", () => {
  it("Bonus Box ×1 — только «Открыть»", () => {
    const out = card(REF_BOX_PACK_ID, 1);
    expect(out).toContain("chips.open<");
    expect(out).not.toContain("data-mystic-open-all");
  });

  it("Bonus Box ×5 — «Все ×5»", () => {
    const out = card(REF_BOX_PACK_ID, 5);
    expect(out).toContain('data-mystic-open-all="5"');
    expect(out).toContain("chips.all_n{&quot;n&quot;:5}");
    expect(out).toContain("chips.open<");
  });

  it("Bonus Box ×15 — «Все ×15», никакого «×10»", () => {
    const out = card(REF_BOX_PACK_ID, 15);
    expect(out).toContain('data-mystic-open-all="15"');
    expect(out).toContain("chips.all_n{&quot;n&quot;:15}");
    expect(out).not.toContain("×10");
  });

  it("Bonus Box ×120 — «Открыть 50»", () => {
    const out = card(REF_BOX_PACK_ID, 120);
    expect(out).toContain('data-mystic-open-all="50"');
    expect(out).toContain("chips.mystic_open_count{&quot;n&quot;:50}");
    expect(out.match(/data-mystic-open-all/g)).toHaveLength(1);
  });

  it("другой мистический бокс ×120 — только «Открыть»", () => {
    const out = card("cp_other", 120);
    expect(out).not.toContain("data-mystic-open-all");
    expect(out).toContain("chips.open<");
  });
});
