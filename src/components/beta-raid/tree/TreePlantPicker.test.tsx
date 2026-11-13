// Окно «Посадить дерево» глазами игрока: кнопка «Посадить» у стопки дерева в
// рюкзаке; окно — имя дерева на языке игрока, цена 15 энергии, семь гексов с
// подсветкой сервера (зелёный — можно, красный — нельзя), ru+en. Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";
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
vi.mock("@/server/api/beta-raid/tree/tree-plant", () => ({ plantTree: vi.fn() }));
vi.mock("@/server/api/beta-raid/tree/tree-plant-cells", () => ({ getTreePlantCells: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-place", () => ({ placeDaraiMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-protect", () => ({ protectMushroom: vi.fn() }));
vi.mock("@/components/beta-raid/ResourceActionDialog", () => ({
  ResourceActionDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { TreePlantPicker } = await import("./TreePlantPicker");
const { TREE_CELLS_KEY } = await import("./useTreePlant");
const { BackpackPlacePicker } = await import("@/components/beta-raid/BackpackPlacePicker");
const { placeKindOf } = await import("@/components/beta-raid/backpackPlace");

const KEY = "tree:decoration_wnfmRe6dly";
const stack = (count = 2) =>
  ({
    stackKey: KEY,
    kind: "tree",
    name: "Дуб",
    image: null,
    count,
    cells: 1,
    potion: false,
    collected: 0,
    chest: false,
  }) as BackpackStack;

const render = () => {
  const qc = new QueryClient();
  qc.setQueryData(TREE_CELLS_KEY, [
    { dq: 0, dr: -1, ok: true, reason: null },
    { dq: 1, dr: -1, ok: false, reason: "tree.road" },
    { dq: -1, dr: 0, ok: true, reason: null },
    { dq: 0, dr: 0, ok: true, reason: null },
    { dq: 1, dr: 0, ok: false, reason: "tree.busy" },
    { dq: -1, dr: 1, ok: false, reason: "tree.water" },
    { dq: 0, dr: 1, ok: true, reason: null },
  ]);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TreePlantPicker stackKey={KEY} stack={stack()} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  v.lang = "ru";
  vi.stubGlobal("document", {});
});

describe("окно «Посадить дерево»", () => {
  it("ru: заголовок, имя, цена 15 энергии, зелёные и красные гексы", () => {
    const html = render();
    expect(html).toContain("Посадить дерево");
    expect(html).toContain("Дуб");
    expect(html).toContain("Посадить · ⚡15");
    expect(html.match(/bg-success\/80/g)).toHaveLength(4);
    expect(html.match(/bg-destructive\/70/g)).toHaveLength(3);
  });

  it("en: имя шаблона переводом", () => {
    v.lang = "en";
    const html = render();
    expect(html).toContain("Plant a tree");
    expect(html).toContain("Oak");
    expect(html).toContain("Plant · ⚡15");
  });

  it("у стопки дерева есть «Посадить»; окно — по ключу стопки, даже когда она кончилась", () => {
    expect(placeKindOf(stack())).toBe("tree");
    expect(placeKindOf({ ...stack(), stackKey: "custom:cst_x" })).toBeNull();
    const el = BackpackPlacePicker({ stackKey: KEY, stacks: [], onClose: () => {} });
    expect(el?.type).toBe(TreePlantPicker);
    expect(el?.props.stack).toBeNull();
  });

  it("стопка кончилась — окно не рисуется", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TreePlantPicker stackKey={KEY} stack={null} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toBe("");
  });
});
