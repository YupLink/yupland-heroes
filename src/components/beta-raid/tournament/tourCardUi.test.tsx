// Плашка турнира одним блоком: заголовок — кнопка раскрытия с шевроном,
// под ним всегда строка статуса (запись или «Вы участвуете · место · очки»),
// раскрытая — вкладки «Участники | Условия | Призы», по умолчанию участники.
//
// Окружение node, DOM нет: рендер в строку; запись и сервер подменены.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TourPlate } from "@/lib/tournament/types";

vi.mock("@/lib/i18n", async (orig) => {
  const m = await orig<typeof import("@/lib/i18n")>();
  return {
    ...m,
    useLang: () => "ru",
    useT: () => (k: string, p?: Record<string, string | number>) => m.tFor("ru", k, p),
  };
});
vi.mock("./useTourJoin", () => ({ useTourJoin: () => ({ mutate: () => {}, isPending: false }) }));
vi.mock("@/server/api/tournament/tour-read", () => ({
  getTourTable: async () => ({ rows: [], mine: null, total: 0 }),
}));

const { TourPlateCard } = await import("./TourPlateCard");

const NOW = Date.parse("2026-10-05T12:00:00Z");
const base: TourPlate = {
  id: "t1",
  name: "Фарм шахт",
  metric: "farm",
  status: "running",
  startedAt: "2026-10-05T00:00:00Z",
  endsAt: "2026-10-11T23:52:00Z",
  finishedAt: null,
  players: 32,
  myPlace: null,
  myScore: null,
  bands: [],
  startAt: null,
  endAt: null,
  joined: false,
  entryPrice: [{ resource: "gold", amount: 5 }],
};

const render = (plate: TourPlate, open = false) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TourPlateCard q={0} r={0} plate={plate} now={NOW} open={open} onToggle={() => {}} />
    </QueryClientProvider>,
  ).replace(/[\u00a0\u202f]/g, " ");
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("плашка турнира", () => {
  it("свёрнута: заголовок — кнопка раскрытия, участники — записавшиеся, кнопка записи", () => {
    const html = render(base);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Участников: 32"');
    expect(text(html)).toContain("Записаться");
    expect(html).not.toContain('role="tablist"');
  });

  it("записан с местом — «Вы участвуете · место 4 · 1 830 очков» и #4 у шеврона", () => {
    const t = text(render({ ...base, joined: true, myPlace: 4, myScore: 1830 }));
    expect(t).toContain("Вы участвуете · место 4 · 1 830 очков");
    expect(t).toContain("#4");
    expect(t).not.toContain("Записаться");
  });

  it("записан без очков — «очков пока нет»; одно очко — «1 очко»", () => {
    expect(text(render({ ...base, joined: true }))).toContain("Вы участвуете · очков пока нет");
    expect(text(render({ ...base, joined: true, myPlace: 1, myScore: 1 }))).toContain(
      "место 1 · 1 очко",
    );
    // Дробный счёт округлён до «27» — и слово по «27»: не «27 очка».
    expect(text(render({ ...base, joined: true, myPlace: 7, myScore: 27.03 }))).toContain(
      "место 7 · 27 очков",
    );
  });

  it("раскрыта: вкладки «Участники | Условия | Призы», выбраны участники", () => {
    const html = render({ ...base, joined: true }, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="tablist"');
    const tabs = [...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([^<]+)</g)];
    expect(tabs.map((m) => [m[2], m[1]])).toEqual([
      ["Участники", "true"],
      ["Условия", "false"],
      ["Призы", "false"],
    ]);
  });
});
