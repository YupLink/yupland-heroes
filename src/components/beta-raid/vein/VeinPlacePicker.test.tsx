// Окно «Положить жилу» глазами игрока: у стопки жилы в рюкзаке — «Положить»
// (Place), окно — 37 гексов радиуса 3 с подсветкой сервера (зелёный — ляжет,
// красный — нет), имя вида на языке игрока, «В руку» и «Разместить», ru+en.
// Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";
import { throwRows } from "@/lib/dynamite";
import type { VeinCell } from "@/lib/veinPlace";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/server/api/beta-raid/vein/vein-place", () => ({ placeVein: vi.fn() }));
vi.mock("@/server/api/beta-raid/vein/vein-spots", () => ({ getVeinSpots: vi.fn() }));
vi.mock("@/server/api/beta-raid/dynamite/dynamite-throw", () => ({ throwDynamite: vi.fn() }));
vi.mock("@/server/api/beta-raid/dynamite/dynamite-cells", () => ({ getDynamiteCells: vi.fn() }));
vi.mock("@/server/api/beta-raid/tree/tree-plant", () => ({ plantTree: vi.fn() }));
vi.mock("@/server/api/beta-raid/tree/tree-plant-cells", () => ({ getTreePlantCells: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-place", () => ({ placeDaraiMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-protect", () => ({ protectMushroom: vi.fn() }));
vi.mock("@/components/beta-raid/ResourceActionDialog", () => ({
  ResourceActionDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { VeinPlacePicker } = await import("./VeinPlacePicker");
const { VEIN_SPOTS_KEY } = await import("./useVeinPlace");
const { BackpackPlacePicker } = await import("@/components/beta-raid/BackpackPlacePicker");
const { placeKindOf, placeableKeys } = await import("@/components/beta-raid/backpackPlace");

const KEY = "vein:gold";
const stack = (count = 5) =>
  ({
    stackKey: KEY,
    kind: "vein",
    name: "Золотая жила",
    image: "/raid/veins/gold.webp",
    count,
    cells: 1,
    potion: false,
    collected: 0,
    chest: false,
  }) as BackpackStack;

/** 37 клеток: верхний ряд — вода (красные), остальные держат жилу. */
const cells = (): VeinCell[] =>
  throwRows()
    .flat()
    .map(({ dq, dr }) => {
      const water = dr === -3;
      return { dq, dr, ok: !water, reason: water ? "vein.water" : null, hit: null, cost: 0 };
    });

const render = () => {
  const qc = new QueryClient();
  qc.setQueryData([...VEIN_SPOTS_KEY, KEY, null, null], { center: { q: 4, r: 2 }, cells: cells() });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <VeinPlacePicker stackKey={KEY} stack={stack()} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  v.lang = "ru";
  vi.stubGlobal("document", {});
});

describe("окно «Положить жилу»", () => {
  it("ru: заголовок, имя вида, 37 гексов — зелёные и красные, «В руку» и «Разместить»", () => {
    const html = render();
    expect(html).toContain("Положить жилу");
    expect(html).toContain("Золотая жила");
    expect(html).toContain("×5");
    expect(html.match(/aria-label="-?\d,-?\d"/g)).toHaveLength(37);
    expect(html.match(/bg-success\/70/g)).toHaveLength(33);
    expect(html.match(/bg-destructive\/60/g)).toHaveLength(4);
    expect(html).toContain("В руку");
    expect(html).toContain("Разместить");
    // Клетки не выбраны — «Разместить» выключена.
    expect(html).toMatch(/<button type="button" disabled="" class="flex h-11 min-w-0/);
  });

  it("en: Place a vein / Gold vein / Place", () => {
    v.lang = "en";
    const html = render();
    expect(html).toContain("Place a vein");
    expect(html).toContain("Gold vein");
    expect(html).toContain("To hand");
  });

  it("стопка кончилась — окно не рисуется", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <VeinPlacePicker stackKey={KEY} stack={null} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toBe("");
  });
});

describe("кнопка в рюкзаке", () => {
  it("у жилы — «Положить»; окно — по ключу стопки, даже когда она кончилась", () => {
    expect(placeKindOf(stack())).toBe("vein");
    expect(placeableKeys([stack()]).has(KEY)).toBe(true);
    expect(dict["vein.put"]).toEqual({ ru: "Положить", en: "Place" });
    const el = BackpackPlacePicker({ stackKey: KEY, stacks: [], onClose: () => {} });
    expect(el?.type).toBe(VeinPlacePicker);
    expect(el?.props.stack).toBeNull();
  });

  it("все отказы жилы переведены на оба языка", () => {
    for (const k of [
      "vein.far",
      "vein.no_cell",
      "vein.void",
      "vein.water",
      "vein.castle",
      "vein.road",
      "vein.built",
      "vein.decor",
      "vein.taken",
      "vein.no_item",
      "vein.island",
      "vein.busy",
    ]) {
      expect(dict[k]?.ru, k).toBeTruthy();
      expect(dict[k]?.en, k).toBeTruthy();
    }
  });
});
