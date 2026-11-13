// Таймер на грибах в рюкзаке (игрок 25.10: «Showing timer in backpack on
// mushrooms… so that we know what time left to place them»; ПРАВИЛА §8.65):
// в каждой ячейке грибов — «мм:сс» до ближайшего выпадения. Рюкзак на карте
// (BackpackCell), «Вещи героя» в замке (HeroItemsUnified), колонка рюкзака у
// склада/сундука/мешочка (WarehouseCells, только сторона героя) и склад замка
// (WarehouseScreen). Таймер — рюкзака своего героя: у героя из таверны — его,
// без героя — выбранного.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DmineTimer } from "@/lib/daraiMine";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

let lang: "ru" | "en" = "ru";
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(lang, key, p),
    useLang: () => lang,
  };
});
vi.mock("@/server/api/beta-raid/dmine/dmine-read", () => ({ getMyDaraiMines: async () => [] }));

const { DMINE_TIMERS_KEY } = await import("./useDaraiMines");
const { FilledCell } = await import("@/components/beta-raid/BackpackCell");
const WarehouseCells = await import("@/components/beta-raid/WarehouseCells");
const { HeroItemsUnified } = await import("@/components/castle-live/HeroItemsUnified");
const { WarehouseScreen } = await import("@/components/castle-live/warehouse/WarehouseScreen");

const NOW = Date.parse("2026-10-25T12:00:00Z");
const MIN = 60_000;
const timer = (heroId: string, selected: boolean, stackKey: string, leftMs: number): DmineTimer => ({
  heroId,
  selected,
  stackKey,
  expiresAt: NOW + leftMs,
  count: 1,
});
const TIMERS = [
  timer("h1", true, "dmine:darai", 12 * MIN + 34_000),
  timer("h1", true, "dmine:gold", 3 * MIN),
  timer("h2", false, "dmine:darai", 45 * MIN),
];

function html(node: ReactElement): string {
  const qc = new QueryClient();
  qc.setQueryData(DMINE_TIMERS_KEY, TIMERS);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  lang = "ru";
});
afterEach(() => vi.useRealTimers());

describe("рюкзак на карте (BackpackCell)", () => {
  const cell = (stackKey: string, heroId?: string) =>
    html(
      <FilledCell
        cell={{ key: `${stackKey}#0`, stackKey, name: "Гриб", image: null, units: 2 }}
        onTrash={null}
        onUse={null}
        onInfo={null}
        onPlace={() => {}}
        heroId={heroId}
      />,
    );
  it("выбранный герой — свой отсчёт у каждого вида; мало времени — красным", () => {
    expect(cell("dmine:darai")).toContain(">12:34<");
    expect(cell("dmine:darai")).toContain('aria-label="Выпадет через 12:34"');
    expect(cell("dmine:gold")).toMatch(/text-destructive[^>]*>.*03:00</);
    // Число штук — своим значком, отсчёт рядом не прячется.
    expect(cell("dmine:darai")).toContain(`>2/${CELL_SIZE}<`);
  });
  it("герой из таверны — его отсчёт, не выбранного; нет грибов у него — нет отсчёта", () => {
    expect(cell("dmine:darai", "h2")).toContain(">45:00<");
    expect(cell("dmine:gold", "h2")).not.toContain('role="timer"');
  });
  it("не гриб — без отсчёта; английский", () => {
    expect(cell("custom:soda")).not.toContain('role="timer"');
    lang = "en";
    expect(cell("dmine:darai")).toContain('aria-label="Drops out in 12:34"');
  });
});

describe("«Вещи героя» в замке (HeroItemsUnified)", () => {
  const view = (heroId: string) =>
    html(
      <HeroItemsUnified
        allowUse={false}
        data={{
          heroId,
          heroName: "Ведьма",
          capacity: 8,
          occupied: 2,
          trade: 0,
          alchemy: 0,
          potionCapacity: 2,
          potionOccupied: 0,
          mainTool: null,
          stacks: [
            { stackKey: "dmine:darai", name: "Гриб DARAI", image: null, count: 3, cells: 1, potion: false },
            { stackKey: "custom:axe", name: "Топор", image: null, count: 1, cells: 1, potion: false },
          ],
        } as unknown as Parameters<typeof HeroItemsUnified>[0]["data"]}
      />,
    );
  it("в ячейке гриба — отсчёт этого героя, рядом с числом штук", () => {
    const h1 = view("h1");
    expect(h1).toContain('class="hero-items-cell"');
    expect(h1).toMatch(/hero-items-timer"[^>]*>.*12:34</);
    expect(h1).toContain("×3");
    expect(view("h2")).toMatch(/hero-items-timer"[^>]*>.*45:00</);
    // Топор — без отсчёта: таймер ровно один.
    expect(h1.match(/role="timer"/g)).toHaveLength(1);
  });
});

describe("склад, сундук, мешочек — колонка рюкзака (WarehouseCells)", () => {
  const cell = (dir: "in" | "out") =>
    html(
      <WarehouseCells.FilledCell
        cell={{
          key: "dmine:gold#0",
          units: 1,
          stack: { stackKey: "dmine:gold", name: "Золотой гриб", image: null, count: 1, cells: 1 },
        }}
        dir={dir}
        busy={false}
        onClick={() => {}}
      />,
    );
  it("сторона героя — отсчёт выбранного героя; сторона хранилища — нет", () => {
    expect(cell("in")).toContain(">03:00<");
    expect(cell("out")).not.toContain('role="timer"');
  });
});

describe("склад замка (WarehouseScreen)", () => {
  it("гриб в вещах героя — отсчёт в ячейке", () => {
    const out = html(
      <WarehouseScreen
        items={[]}
        capacity={4}
        backpack={[{ id: "dmine:darai#0", stackKey: "dmine:darai", name: "Гриб DARAI", count: 1 }]}
        potions={[]}
        locations={[]}
        onBack={() => {}}
        onMove={() => "ok"}
        onUse={() => {}}
      />,
    );
    expect(out).toMatch(/wh-timer"[^>]*>.*12:34</);
  });
});
