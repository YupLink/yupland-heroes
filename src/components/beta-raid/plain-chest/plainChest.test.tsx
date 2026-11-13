// Обычный сундук глазами игрока (§8.22): окно как склад — слева рюкзак, справа
// десять ячеек сундука (пустые видны), оба языка; слой сундуков перечитывается,
// когда событие задело обычный сундук, а «Добыча» — нет (хозяина нет); лопата —
// только с целой штукой; бугорок сундука — по id. Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import type { PlainChestView } from "@/lib/plainChest";
import { chestMoundId, isChestMound, isPlaceDir, PLACE_DIRS } from "@/lib/plainChest";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { dict } from "@/lib/translations";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { PlainChestGrid } = await import("@/components/beta-raid/plain-chest/PlainChestGrid");
const { pickMain } = await import("@/lib/raid/mainTool");
const { CHESTS_KEY, HARVEST_LIVE_KEY, chestLiveKeys } = await import(
  "@/components/beta-raid/chest/chestLive"
);

const view: PlainChestView = {
  q: 5,
  r: 6,
  name: "Сундук",
  image: null,
  cells: 10,
  used: 2,
  slots: [
    {
      stackKey: "custom:cst_a",
      kind: "custom",
      refId: "cst_a",
      name: "Банан",
      image: null,
      count: CELL_SIZE + 5,
    },
  ],
};
const stack = (over: object) => ({
  stackKey: "custom:cst_apple",
  kind: "custom",
  name: "Яблоко",
  image: null,
  count: 4,
  cells: 1,
  potion: false,
  collected: 0,
  chest: false,
  ...over,
});
const backpack = {
  heroId: "h1",
  heroName: "Лис",
  capacity: 3,
  occupied: 1,
  potionCapacity: 0,
  potionOccupied: 0,
  stacks: [stack({})],
} as unknown as BackpackView;
const render = () =>
  renderToStaticMarkup(
    <PlainChestGrid view={view} backpack={backpack} busyKey={null} onPut={() => {}} onTake={() => {}} />,
  );
const buttons = (html: string) => (html.match(/<button/g) ?? []).length;

beforeEach(() => void (v.lang = "ru"));

describe("окно сундука", () => {
  it("слева рюкзак, справа десять ячеек: занятые — плитками, пустые видны", () => {
    const html = render();
    expect(html).toContain("Сундук · 2/10");
    expect(html).toContain("Лис");
    // Плитки: яблоко слева, банан (ячейка и ещё 5 = две ячейки) справа.
    expect(buttons(html)).toBe(3);
    expect(html).toContain("Банан");
  });

  it("английский", () => {
    v.lang = "en";
    expect(render()).toContain("Chest · 2/10");
  });
});

describe("лопата, бугорок, клетки установки", () => {
  it("лопата — только с целой штукой (§8.24: кнопка лопаты окна — по основному)", () => {
    const with1 = [stack({ stackKey: "custom:cst_sh", shovel: true, count: 1 })];
    const zero = [stack({ stackKey: "custom:cst_sh", shovel: true, count: 0.5 })];
    expect(pickMain(null, with1, { kind: "shovel" }).ok).toBe(true);
    expect(pickMain(null, zero, { kind: "shovel" }).ok).toBe(false);
    expect(pickMain(null, [], { kind: "shovel" }).ok).toBe(false);
  });

  it("бугорок сундука узнаётся по id, мешочек — нет", () => {
    expect(isChestMound(chestMoundId(-3, 7))).toBe(true);
    expect(isChestMound("lb_0123")).toBe(false);
  });

  it("ставить можно под себя и на шесть соседних клеток — не дальше", () => {
    expect(PLACE_DIRS).toHaveLength(7);
    expect(isPlaceDir(0, 0)).toBe(true);
    expect(isPlaceDir(1, -1)).toBe(true);
    expect(isPlaceDir(1, 1)).toBe(false);
    expect(isPlaceDir(-1, -1)).toBe(false);
  });
});

describe("живой поток: обычный сундук на слое", () => {
  const qc = () => {
    const c = new QueryClient();
    c.setQueryData(CHESTS_KEY, {
      chests: {},
      plain: { "3,4": { mine: false, plain: true, image: null, name: "Сундук" } },
    });
    c.setQueryData(["beta-raid-map"], { packed: null });
    return c;
  };
  it("задет обычный сундук — слой перечитываем, «Добычу» — нет", () => {
    const keys = chestLiveKeys(qc(), ["3,4"]);
    expect(keys).toContain(CHESTS_KEY[0]);
    expect(keys).not.toContain(HARVEST_LIVE_KEY);
  });
});
