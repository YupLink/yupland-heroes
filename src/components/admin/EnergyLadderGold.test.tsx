// Энергопак в админке (владелец, 21.10.2026): цена строки «золото» видна и вводится
// в золоте, в базу уходит прежний формат — ступень kind 'tickets' в билетах
// (золото ÷ 500, дробь сохраняется). Старое одиночное поле price_tickets — тоже ×500.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OfferPricing, CurrencyStep } from "@/lib/energySteps";

vi.mock("./shop/UsdPriceField", () => ({ UsdPreview: () => null }));

const { StepLadderRow } = await import("./StepLadderRow");
const { EnergyLadderEditor } = await import("./EnergyLadderEditor");
const { EnergyPackPriceLine } = await import("./EnergyPackPriceLine");

type El = { type: unknown; key: string | null; props: Record<string, unknown> };
function* walk(node: unknown): Generator<El> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
  } else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    yield el;
    yield* walk(el.props.children);
  }
}
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/\u00a0|\u202f/g, " ");

describe("StepLadderRow со шкалой", () => {
  it("показывает хранимое × scale и пишет введённое ÷ scale", () => {
    const seen: CurrencyStep[][] = [];
    const steps = [
      { amount: 5, times: 1 },
      { amount: 2.468, times: 2 },
    ];
    const out = html(<StepLadderRow steps={steps} onChange={() => {}} scale={500} />);
    expect(out).toContain('value="2500"');
    expect(out).toContain('value="1234"');
    const tree = StepLadderRow({ steps, onChange: (s) => seen.push(s), scale: 500 });
    const price = [...walk(tree)].find((e) => e.type === "input" && e.props.value === 2500);
    (price?.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: "1250" },
    });
    expect(seen[0][0]).toEqual({ amount: 2.5, times: 1 });
  });

  it("без шкалы — как раньше (энергия за лайки)", () => {
    expect(html(<StepLadderRow steps={[{ amount: 7, times: 1 }]} onChange={() => {}} />)).toContain(
      'value="7"',
    );
  });
});

describe("EnergyLadderEditor — строка золота", () => {
  const pricing: OfferPricing = [
    {
      kind: "tickets",
      steps: [
        { amount: 10, times: 1 },
        { amount: 20, times: 1 },
      ],
    },
    { kind: "darai", steps: [{ amount: 2000000, times: 1 }] },
  ];

  it("подпись «Золото», значок золота, цены ×500, без «билетов»", () => {
    const out = html(
      <EnergyLadderEditor pricing={pricing} onChange={() => {}} tokenSymbols={[]} />,
    );
    expect(out).toContain("Золото");
    expect(out).toContain("/resources/gold.png");
    expect(out).toContain('value="5000"');
    expect(out).toContain('value="10000"');
    expect(out).toContain('value="2000000"');
    expect(out).not.toMatch(/билет|× 500/);
  });

  it("паку без золота можно добавить строку: 500 золота = 1 билет в базе", () => {
    const next: OfferPricing[] = [];
    const darai: OfferPricing = [pricing[1]];
    const tree = EnergyLadderEditor({
      pricing: darai,
      onChange: (p) => next.push(p),
      tokenSymbols: [],
    });
    const add = [...walk(tree)].find((e) => e.type === "button" && e.key === "tickets");
    expect(add?.props.disabled).toBe(false);
    (add?.props.onClick as () => void)();
    expect(next[0]).toEqual([...darai, { kind: "tickets", steps: [{ amount: 1, times: 1 }] }]);
  });
});

describe("EnergyPackPriceLine", () => {
  const base = { priceDarai: null, priceTokenSymbol: null, priceTokenAmount: null, dailyLimit: 1 };
  it("одиночная цена в билетах показана золотом ×500", () => {
    const out = html(<EnergyPackPriceLine p={{ ...base, priceTickets: 5 }} />);
    expect(out).toContain("/resources/gold.png");
    expect(out).toContain("2 500");
  });
  it("нет цены — прочерк, ничего не выдумываем", () => {
    expect(html(<EnergyPackPriceLine p={{ ...base, priceTickets: null }} />)).toContain("—");
  });
});
