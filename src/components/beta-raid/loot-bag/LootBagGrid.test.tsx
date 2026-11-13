// Мешочек как склад глазами игрока (§8.21): слева рюкзак героя плитками
// склада (стрелка «в мешочек»), справа мешочек (стрелка «в рюкзак») с «осталось
// N ч» ближайшей порции на плитке; у бугорка — только он и его срок. Оба языка.
// Рендер на сервере — без браузера.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LootBagView } from "@/lib/lootBag";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { dict } from "@/lib/translations";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { LootBagGrid } = await import("@/components/beta-raid/loot-bag/LootBagGrid");

const H = 3600_000;
const bag = (over: Partial<LootBagView> = {}): LootBagView => ({
  id: "lb_1",
  buried: false,
  leftMs: 23 * H,
  items: [
    {
      stackKey: "custom:cst_b",
      kind: "custom",
      refId: "cst_b",
      name: "Банан",
      image: null,
      count: CELL_SIZE + 5,
      leftMs: 5 * H + 10 * 60_000,
    },
  ],
  ...over,
});
const backpack = {
  heroId: "h1",
  heroName: "Лис",
  capacity: 3,
  occupied: 1,
  potionCapacity: 0,
  potionOccupied: 0,
  stacks: [
    {
      stackKey: "custom:cst_apple",
      kind: "custom",
      name: "Яблоко",
      image: null,
      count: 4,
      cells: 1,
      potion: false,
      collected: 0,
      chest: false,
    },
  ],
} as unknown as BackpackView;
const render = (b: LootBagView, now = 0) =>
  renderToStaticMarkup(
    <LootBagGrid
      bag={b}
      backpack={backpack}
      gotAt={0}
      now={now}
      busyKey={null}
      onPut={() => {}}
      onTake={() => {}}
    />,
  );
const tiles = (html: string) => (html.match(/<button/g) ?? []).length;

beforeEach(() => {
  v.lang = "ru";
});

describe("мешочек", () => {
  it("рюкзак слева (плитка и пустые ячейки), мешочек справа: ячейка и ещё 5 бананов — две плитки", () => {
    const html = render(bag());
    expect(html).toContain("Рюкзак · Лис · 1/3");
    expect(html).toContain("Яблоко");
    expect(html).toContain("Банан");
    expect(html).toContain(`${CELL_SIZE}/${CELL_SIZE}`);
    expect(html).toContain(`5/${CELL_SIZE}`);
    // Яблоко + две плитки бананов — кнопки; пустые ячейки рюкзака — не кнопки.
    expect(tiles(html)).toBe(3);
  });

  it("на плитке мешочка — «осталось N ч» ближайшей порции; последний час — минуты", () => {
    expect(render(bag())).toContain("осталось 5 ч");
    expect(render(bag(), 5 * H - 20 * 60_000)).toContain("осталось 30 мин");
  });

  it("порция сгорела — срока на плитке нет", () => {
    expect(render(bag(), 6 * H)).not.toContain("осталось");
  });

  it("английский", () => {
    v.lang = "en";
    expect(render(bag())).toContain("5 h left");
  });

  it("ресурс разборки шахты (§8.70): одна плитка, значок и имя ресурса, без срока", () => {
    const wood = {
      stackKey: "resource:wood",
      kind: "resource",
      refId: "wood",
      name: "Дерево",
      image: null,
      count: 9000,
      leftMs: 87_600 * H,
    };
    const html = render(bag({ items: [wood], leftMs: 87_600 * H }));
    expect(tiles(html)).toBe(2);
    expect(html).toContain("Дерево");
    expect(html).toContain('src="/resources/wood.webp"');
    expect(html).not.toContain("осталось");
    v.lang = "en";
    expect(render(bag({ items: [wood] }))).toContain("Wood");
  });

  it("у плитки ресурса — только число: на счёт, а не в ячейку, «/N» нет", () => {
    const wood = {
      stackKey: "resource:wood",
      kind: "resource",
      refId: "wood",
      name: "Дерево",
      image: null,
      count: 300,
      leftMs: 87_600 * H,
    };
    const html = render(bag({ items: [wood] }));
    expect(html).toMatch(/>300<\/span>/);
    expect(html).not.toContain(`300/${CELL_SIZE}`);
    // Плитка рюкзака рядом — ячейка, у неё «/N» остаётся.
    expect(html).toContain(`4/${CELL_SIZE}`);
  });
});

describe("бугорок", () => {
  // 29.09 (§8.22): бугорок бывает и из-под сундука — по окну не видно, что под
  // ним, поэтому ни содержимого, ни срока (у бугорка сундука срока нет вовсе).
  it("ничего не видно — ни плиток, ни рюкзака, ни срока: одна картинка", () => {
    const html = render(bag({ buried: true, items: [] }));
    expect(tiles(html)).toBe(0);
    expect(html).not.toContain("Яблоко");
    expect(html).not.toContain("осталось");
    expect(html).toContain("<img");
  });
});
