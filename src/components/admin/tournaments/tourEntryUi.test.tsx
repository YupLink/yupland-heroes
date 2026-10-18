// Цена записи на экране админки: в форме нового турнира сразу 5 золота и в
// списке ресурсов только то, чем запись можно оплатить; у портала список
// прежний; плашка показывает цену коротко, пустую — «бесплатно».
//
// Окружение node, DOM нет: рендер в строку, тяжёлые соседи формы (места,
// расписание, выбор товара) подменены заглушками.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TourAdminRow } from "@/lib/tournament/types";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, p?: Record<string, string | number>) =>
    p ? `${key}:${Object.values(p).join("|")}` : key,
}));
vi.mock("@/server/api/admin-payouts", () => ({ listRewardTokens: async () => [] }));
vi.mock("@/components/admin/hex-editor/PriceItemPicker", () => ({ PriceItemPicker: () => null }));
vi.mock("./TourBandRow", () => ({ TourBandRow: () => null }));
vi.mock("./TourScheduleFields", () => ({ TourScheduleFields: () => null }));

const { TourEditor } = await import("./TourEditor");
const { TourPlate } = await import("./TourPlate");
const { PortalPricesEditor } = await import("@/components/admin/hex-editor/PortalPricesEditor");
const { emptyTourDraft } = await import("./tourDraft");

const render = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
const noop = () => {};

describe("форма турнира: цена записи", () => {
  it("новый турнир — 5 золота, в списке нет паков, героев, боссов", () => {
    const html = render(
      <TourEditor
        value={emptyTourDraft()}
        onChange={noop}
        onSave={noop}
        saving={false}
        onClose={noop}
      />,
    );
    expect(html).toContain("Цена записи");
    expect(html).toContain('<option value="gold" selected="">Золото</option>');
    expect(html).toContain('value="5"');
    expect(html).toContain(">Алмазы<");
    for (const label of [">Пак<", ">Герой<", ">Босс<", ">Артефакт<", ">Свой товар<"]) {
      expect(html).not.toContain(label);
    }
  });

  it("пустая цена — «Запись бесплатная»", () => {
    const html = render(
      <TourEditor
        value={{ ...emptyTourDraft(), entryPrice: [] }}
        onChange={noop}
        onSave={noop}
        saving={false}
        onClose={noop}
      />,
    );
    expect(html).toContain("Запись бесплатная");
  });

  it("портал без нового пропа — прежний список и прежняя подпись", () => {
    const html = render(<PortalPricesEditor prices={[]} tokens={[]} onChange={noop} />);
    expect(html).toContain("Бесплатно — проход открыт всем.");
    const one = render(
      <PortalPricesEditor prices={[{ resource: "gold", amount: 1 }]} tokens={[]} onChange={noop} />,
    );
    expect(one).toContain(">Пак<");
    expect(one).toContain(">Босс<");
  });
});

describe("плашка турнира: цена записи", () => {
  const row = (entryPrice: TourAdminRow["entryPrice"]): TourAdminRow => ({
    id: "t1",
    name: "Урон",
    metric: "damage",
    days: 7,
    status: "draft",
    bands: [],
    fundDarai: 0,
    createdAt: "2026-10-04T00:00:00Z",
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    players: 0,
    dry: false,
    startAt: null,
    endAt: null,
    lastError: null,
    entryPrice,
  });
  const plate = (r: TourAdminRow) =>
    render(
      <TourPlate
        row={r}
        now={0}
        busy={false}
        onStart={noop}
        onStop={noop}
        onDelete={noop}
        onEdit={noop}
        onBoard={noop}
      />,
    );

  it("цена — той же строкой, что видит игрок; пусто — «бесплатно»", () => {
    const paid = plate(
      row([
        { resource: "gold", amount: 5 },
        { resource: "token", token: "USDT", amount: 1 },
      ]),
    );
    expect(paid).toContain("tour.adm.entry:5 золота + 1 USDT");
    expect(plate(row([]))).toContain("tour.adm.entry_free");
  });
});
