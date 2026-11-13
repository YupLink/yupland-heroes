// Окно мешочка (§8.21): «Забрать всё» — одна кнопка НАД плитками (владелец,
// 23.10: внизу под рюкзаком её не видели), жмёт «всё» без стопки; у закрытого
// мешочка и у бугорка её нет. Рендер на сервере — без браузера.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { LootBagView } from "@/lib/lootBag";
import { dict } from "@/lib/translations";

const take = vi.hoisted(() => vi.fn());

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/server/api/beta-raid/loot-bag/bag-read", () => ({ getLootBagsAt: vi.fn() }));
vi.mock("@/server/api/beta-raid/market-backpack-read", () => ({ getMyBackpack: vi.fn() }));
vi.mock("@/components/beta-raid/chest/ChestSheet", () => ({
  ChestSheet: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));
vi.mock("@/components/beta-raid/QtyDialog", () => ({ QtyDialog: () => null }));
vi.mock("@/components/beta-raid/tool/ShovelButton", () => ({
  ShovelButton: () => <button type="button">shovel</button>,
}));
vi.mock("@/components/beta-raid/open-pass/OpenButton", () => ({
  OpenButton: () => <button type="button">open-pass</button>,
}));
vi.mock("@/components/beta-raid/open-pass/useOpenStorage", () => ({
  useOpenStorage: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/components/beta-raid/hud/useRewardClock", () => ({ useRewardClock: () => Date.now() }));
vi.mock("@/components/beta-raid/loot-bag/useLootBagActions", () => {
  const idle = { isPending: false, mutate: vi.fn() };
  return {
    useLootBagActions: () => ({
      take: { isPending: false, mutate: take },
      put: idle,
      dig: idle,
      busy: false,
    }),
  };
});

const { LootBagWindow } = await import("@/components/beta-raid/loot-bag/LootBagWindow");
const { bagsAtKey } = await import("@/components/beta-raid/loot-bag/lootBagLive");

const H = 3600_000;
const wood = {
  stackKey: "resource:wood",
  kind: "resource",
  refId: "wood",
  name: "Дерево",
  image: null,
  count: 300,
  leftMs: 87_600 * H,
};
const bagOf = (over: Partial<LootBagView> = {}): LootBagView => ({
  id: "lb_1",
  buried: false,
  leftMs: 87_600 * H,
  items: [wood],
  open: true,
  ...over,
});
const render = (bag: LootBagView) => {
  const qc = new QueryClient();
  qc.setQueryData(bagsAtKey(5, 7), { q: 5, r: 7, shovel: false, bags: [bag] });
  qc.setQueryData(["my-hero-backpack"], {
    heroId: "h1",
    heroName: "Лис",
    capacity: 5,
    occupied: 0,
    potionCapacity: 0,
    potionOccupied: 0,
    stacks: [],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <LootBagWindow at={{ q: 5, r: 7 }} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

describe("«Забрать всё»", () => {
  it("одна кнопка над плитками мешочка, активна", () => {
    const html = render(bagOf());
    expect(html.match(/Забрать всё/g)).toHaveLength(1);
    expect(html.indexOf("Забрать всё")).toBeLessThan(html.indexOf("Дерево"));
    expect(html.indexOf("Забрать всё")).toBeLessThan(html.indexOf("shovel"));
    const btn = /<button[^>]*>(?:(?!<\/button>).)*Забрать всё<\/button>/.exec(html)?.[0] ?? "";
    expect(btn).not.toContain('disabled=""');
  });

  it("забирать нечего (позиции сгорели до перечитки) — кнопка неактивна", () => {
    const html = render(bagOf({ items: [] }));
    const btn = /<button[^>]*>(?:(?!<\/button>).)*Забрать всё<\/button>/.exec(html)?.[0] ?? "";
    expect(btn).toContain('disabled=""');
  });

  it("закрытый мешочек — только «Открыть», бугорок — без кнопки", () => {
    const closed = render(bagOf({ open: false }));
    expect(closed).toContain("open-pass");
    expect(closed).not.toContain("Забрать всё");
    expect(render(bagOf({ buried: true, items: [] }))).not.toContain("Забрать всё");
  });
});

describe("рыба от красного динамита (30.10.2026)", () => {
  it("окно зовёт её «Рыба»; закрытая — «Открыть», как мешочек", () => {
    const closed = render(bagOf({ fish: true, open: false }));
    expect(closed).toContain("<h2>Рыба</h2>");
    expect(closed).toContain("open-pass");
    expect(render(bagOf())).toContain("<h2>Мешочек</h2>");
  });
});
