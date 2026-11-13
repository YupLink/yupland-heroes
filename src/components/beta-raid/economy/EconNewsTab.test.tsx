// Вкладка «Новости»: текст сводки как есть (переносы строк) и два действия —
// скопировать текст и ссылку на API.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/server/api/news/news-admin", () => ({ adminNewsDigest: vi.fn() }));

const { EconNewsTab } = await import("./EconNewsTab");

const RANGE = { from: "2026-10-22T18:00:00.000Z", to: "2026-10-29T18:00:00.000Z" };

function render(data: unknown): string {
  const qc = new QueryClient();
  if (data) qc.setQueryData(["admin-econ", "news", 7, "ru"], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <EconNewsTab range={RANGE} />
    </QueryClientProvider>,
  );
}

describe("EconNewsTab", () => {
  it("показывает текст сводки и две кнопки", () => {
    const html = render({
      digest: {},
      text: "YupLand · 23–29 октября\n\nВ игру заходили 147 игроков.",
      apiPath: "/api/news?key=k",
    });
    expect(html).toContain("YupLand · 23–29 октября");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("econ.news.copy");
    expect(html).toContain("econ.news.api");
  });

  it("пока данных нет — крутилка", () => {
    expect(render(null)).toContain("animate-spin");
  });
});
