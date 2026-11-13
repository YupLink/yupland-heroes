// Окно «Бросить динамит» глазами игрока: у стопки динамита в рюкзаке — «Бросить»
// (Throw), окно — 37 гексов радиуса 3 с подсветкой сервера (зелёный — можно,
// красный — нельзя), значки того, что заденет, цена 100 энергии, ru+en. После
// броска своя карта и всё затронутое — без F5. Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";
import { throwRows, type DynamiteCell } from "@/lib/dynamite";
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
vi.mock("@/server/api/beta-raid/dynamite/dynamite-throw", () => ({ throwDynamite: vi.fn() }));
vi.mock("@/server/api/beta-raid/dynamite/dynamite-cells", () => ({ getDynamiteCells: vi.fn() }));
vi.mock("@/server/api/beta-raid/tree/tree-plant", () => ({ plantTree: vi.fn() }));
vi.mock("@/server/api/beta-raid/tree/tree-plant-cells", () => ({ getTreePlantCells: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-place", () => ({ placeDaraiMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-protect", () => ({ protectMushroom: vi.fn() }));
vi.mock("@/components/beta-raid/ResourceActionDialog", () => ({
  ResourceActionDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { DynamiteThrowPicker } = await import("./DynamiteThrowPicker");
const { DYNAMITE_CELLS_KEY, invalidateDynamite, sumBlasts } = await import("./useDynamiteThrow");
const { DynamiteHexGrid } = await import("./DynamiteHexGrid");
const { isRefusal } = await import("./useCellBatch");
const { BackpackPlacePicker } = await import("@/components/beta-raid/BackpackPlacePicker");
const { placeKindOf, placeableKeys } = await import("@/components/beta-raid/backpackPlace");

const KEY = "custom:cst_cpsl1cy0hpd7";
const stack = (count = 2) =>
  ({
    stackKey: KEY,
    kind: "custom",
    name: "Динамит (1 Lv)",
    image: null,
    count,
    cells: 1,
    potion: false,
    collected: 0,
    chest: false,
  }) as BackpackStack;

/** 37 клеток: по краю — город (красные), у героя — шахта, моб и дерево. */
const cells = (): DynamiteCell[] =>
  throwRows()
    .flat()
    .map(({ dq, dr }) => {
      const edge = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 3 && dr === -3;
      const hit =
        dq === 1 && dr === 0
          ? "mine"
          : dq === -1 && dr === 0
            ? "mob"
            : dq === 0 && dr === 1
              ? "tree"
              : null;
      return { dq, dr, ok: !edge, reason: edge ? "dynamite.town" : null, hit };
    });

const render = (qc = new QueryClient()) => {
  qc.setQueryData([...DYNAMITE_CELLS_KEY, KEY], { center: { q: 10, r: 5 }, cells: cells() });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <DynamiteThrowPicker stackKey={KEY} stack={stack()} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  v.lang = "ru";
  vi.stubGlobal("document", {});
});

describe("окно «Бросить динамит»", () => {
  it("ru: заголовок, предмет, цена 100 энергии, 37 гексов — зелёные и красные", () => {
    const html = render();
    expect(html).toContain("Бросить динамит");
    expect(html).toContain("Динамит (1 Lv)");
    expect(html).toContain("Бросить · ⚡100");
    expect(html.match(/aria-label="-?\d,-?\d"/g)).toHaveLength(37);
    expect(html.match(/bg-success\/70/g)).toHaveLength(33);
    expect(html.match(/bg-destructive\/60/g)).toHaveLength(4);
  });

  it("en: Throw dynamite / Throw · ⚡100", () => {
    v.lang = "en";
    const html = render();
    expect(html).toContain("Throw dynamite");
    expect(html).toContain("Throw · ⚡100");
  });

  it("клетка не выбрана — бросить нельзя (кнопка выключена)", () => {
    expect(render()).toMatch(/<button type="button" disabled="" class="flex h-11/);
  });

  it("стопка кончилась — окно не рисуется", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DynamiteThrowPicker stackKey={KEY} stack={null} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toBe("");
  });
});

describe("кнопка в рюкзаке", () => {
  it("у динамита — «Бросить»; окно — по ключу стопки, даже когда она кончилась", () => {
    expect(placeKindOf(stack())).toBe("dynamite");
    expect(placeableKeys([stack()]).has(KEY)).toBe(true);
    expect(dict["dynamite.throw"]).toEqual({ ru: "Бросить", en: "Throw" });
    const el = BackpackPlacePicker({ stackKey: KEY, stacks: [], onClose: () => {} });
    expect(el?.type).toBe(DynamiteThrowPicker);
    expect(el?.props.stack).toBeNull();
  });
});

describe("после броска — без F5", () => {
  it("рюкзак, энергия, мешочки, охрана, полосы и флажки шахт, «Добыча», карта, подсветка", () => {
    const qc = new QueryClient();
    const keys: unknown[] = [];
    qc.invalidateQueries = ((f: { queryKey: unknown }) => {
      keys.push(f.queryKey);
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];
    invalidateDynamite(qc, { mines: 1, hits: 0, kills: 0, decor: 0 });
    const flat = keys.map((k) => JSON.stringify(k));
    for (const k of [
      ["my-hero-backpack"],
      ["my-energy"],
      ["beta-raid-state"],
      ["beta-raid-mine-guards"],
      ["beta-raid-mine-life"],
      ["beta-raid-mine-flags"],
      ["beta-raid-harvest"],
      ["raid-pending-rewards"],
      ["beta-raid-map"],
      ["beta-raid-dynamite-cells"],
    ]) {
      expect(flat).toContain(JSON.stringify(k));
    }
    // Кораблей не взорвано — причалы не трогаем; взорваны — причалы и окна корабля.
    keys.length = 0;
    invalidateDynamite(qc, { mines: 0, hits: 1, kills: 0, decor: 0 });
    expect(keys.map((x) => JSON.stringify(x))).not.toContain(JSON.stringify(["beta-raid-ships"]));
    keys.length = 0;
    invalidateDynamite(qc, { mines: 0, hits: 0, kills: 0, decor: 0, ships: 2 });
    for (const k of [["beta-raid-ships"], ["beta-raid-ships-at"], ["ship-repair"], ["ship-scrap"]])
      expect(keys.map((x) => JSON.stringify(x))).toContain(JSON.stringify(k));
  });
});

describe("несколько клеток одним нажатием", () => {
  it("выбранные клетки — золотые, у красного соседи каждой — бледно-золотые", () => {
    const all = cells();
    const pick = [
      all.find((c) => c.dq === 2 && c.dr === 0)!,
      all.find((c) => c.dq === -2 && c.dr === 0)!,
    ];
    const blue = renderToStaticMarkup(
      <DynamiteHexGrid cells={all} picked={pick} kind="blue" onPick={() => {}} />,
    );
    expect(blue.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(blue.match(/bg-gold text-gold-foreground/g)).toHaveLength(2);
    expect(blue).not.toContain("bg-gold/45");
    const red = renderToStaticMarkup(
      <DynamiteHexGrid cells={all} picked={pick} kind="red" onPick={() => {}} />,
    );
    // У (2,0) и (−2,0) по шесть соседей, общий у них — нет; (2,0) у края: 5 + 6.
    expect(red.match(/bg-gold\/45/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it("итог бросков — сумма, тост один", () => {
    expect(
      sumBlasts([
        { mines: 1, hits: 2, kills: 0, decor: 1 },
        { mines: 0, hits: 1, kills: 1, decor: 0, guardsOff: 1, fish: 2 },
      ]),
    ).toEqual({
      mines: 1,
      hits: 3,
      kills: 1,
      decor: 1,
      guardsOff: 1,
      levelsDown: 0,
      broken: 0,
      ships: 0,
      fish: 2,
    });
  });

  it("отказ сервера ключом — новый ключ клетки; обрыв — ключ тот же", () => {
    expect(isRefusal(new Error("dynamite.far"))).toBe(true);
    expect(isRefusal(new Error('mineplace.no_energy|{"need":100}'))).toBe(true);
    expect(isRefusal(new Error("Failed to fetch"))).toBe(false);
  });

  it("ru/en: «Бросить ×N · ⚡…» и «Брошено N из M»", () => {
    expect(dict["dynamite.throw_many"]).toEqual({
      ru: "Бросить ×{k} · ⚡{n}",
      en: "Throw ×{k} · ⚡{n}",
    });
    expect(dict["dynamite.partial"].ru).toBe("Брошено {done} из {all}");
  });
});
