// Окна сундука глазами игрока (29.09.2026): у каждой плитки рюкзака — сколько
// её штук ляжет в сундук (число, без подписей), плитка без собранного
// неактивна; в подтверждении «Забрать сундук» раненая охрана — одной строкой
// и не в списке «В рюкзак». Оба языка. Рендер на сервере — без браузера.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChestNetView, ChestPickupView } from "@/lib/magicChest";
import { dict } from "@/lib/translations";

const v = vi.hoisted(() => ({
  lang: "ru" as "ru" | "en",
  net: null as unknown,
  pickup: null as unknown,
}));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => node }));
vi.mock("@/components/beta-raid/chest/useChestViews", () => ({
  useChestNet: () => ({ data: v.net, isLoading: false }),
  useChestPickupView: () => ({ data: v.pickup, isLoading: false, isFetching: false }),
}));
vi.mock("@/components/beta-raid/chest/useChestActions", () => ({
  useChestNetActions: () => ({ put: { mutate: vi.fn() }, take: { mutate: vi.fn() }, busy: null }),
}));
vi.mock("@/components/beta-raid/chest/chestGuard", () => ({
  guardOf: () => null,
  useGuardLite: () => ({ lite: null }),
}));
vi.mock("@/components/beta-raid/chest/ChestGuardBlock", () => ({ ChestGuardBlock: () => null }));

const { ChestOwnerPanel } = await import("@/components/beta-raid/chest/ChestOwnerPanel");
const { ChestPickupConfirm } = await import("@/components/beta-raid/chest/ChestPickupConfirm");

const stack = (stackKey: string, name: string, count: number, movable: number) => ({
  stackKey,
  kind: "custom",
  name,
  image: null,
  count,
  movable,
});
const netView = (stacks: ReturnType<typeof stack>[]): ChestNetView => ({
  cells: 10,
  used: 0,
  slots: [],
  backpack: { heroName: "Лучник", capacity: 6, occupied: 3, stacks },
  guard: null,
});
const pickupView = (over: Partial<ChestPickupView> = {}): ChestPickupView => ({
  last: false,
  chest: { name: "Магический сундук", image: null },
  guard: null,
  guardWounded: false,
  fits: true,
  need: 0,
  free: 3,
  slots: [],
  taken: [],
  lost: [],
  ...over,
});
/** Плитки рюкзака: обёртка плитки (активная или приглушённая) и её содержимое. */
const tiles = (html: string) =>
  html.split(/(?=<div class="grid(?: pointer-events-none opacity-40)?">)/).slice(1);

beforeEach(() => {
  v.lang = "ru";
});

describe("окно сундука: сколько можно положить", () => {
  it("у плитки — число собранного, у купленной — ни числа, ни нажатия", () => {
    // Бананы: 25 штук, из них 12 собрано → плитки 20 и 5, числа 12 и 0.
    // Пшеница куплена целиком.
    v.net = netView([
      stack("custom:banana", "Банан", 25, 12),
      stack("custom:wheat", "Пшеница", 7, 0),
    ]);
    const html = renderToStaticMarkup(<ChestOwnerPanel q={1} r={2} />);
    const bag = tiles(html).slice(0, 3);
    expect(bag).toHaveLength(3);
    expect(bag[0]).not.toContain("pointer-events-none");
    expect(bag[0]).toContain(">12</span>");
    expect(bag[1]).toContain("pointer-events-none opacity-40");
    expect(bag[2]).toContain("pointer-events-none opacity-40");
    expect(bag[2]).toContain("Пшеница");
    // Пояснений нет — только числа.
    expect(html).not.toMatch(/собран|куплен|collected|bought/i);
  });
});

describe("подтверждение «Забрать сундук»", () => {
  // Окно — портал в document.body; на сервере document нет, даём заглушку.
  beforeEach(() => void vi.stubGlobal("document", { body: {} }));

  it("раненая охрана: строка «не вернётся», в «В рюкзак» — только сундук", () => {
    v.pickup = pickupView({ guardWounded: true });
    const html = renderToStaticMarkup(
      <ChestPickupConfirm q={1} r={2} busy={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("Охрана ранена — не вернётся");
    expect(html).toContain("Магический сундук");
    expect(html).not.toContain("Тролль");
  });

  it("целая охрана — в списке «В рюкзак», строки про рану нет; en — свой текст", () => {
    v.pickup = pickupView({ guard: { name: "Тролль", image: null } });
    const ru = renderToStaticMarkup(
      <ChestPickupConfirm q={1} r={2} busy={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(ru).toContain("Тролль");
    expect(ru).not.toContain("не вернётся");
    v.lang = "en";
    v.pickup = pickupView({ guardWounded: true });
    const en = renderToStaticMarkup(
      <ChestPickupConfirm q={1} r={2} busy={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(en).toContain("The guard is wounded — it won&#x27;t come back");
  });
});

describe("«Забрать сундук»: не влезшее — мешочком (дополнения №2–3, 29.09)", () => {
  beforeEach(() => void vi.stubGlobal("document", { body: {} }));
  const confirm = () =>
    renderToStaticMarkup(
      <ChestPickupConfirm q={1} r={2} busy={false} onConfirm={() => {}} onClose={() => {}} />,
    );
  const slots = [{ stackKey: "custom:ore", kind: "custom", name: "Руда", image: null, count: 30 }];

  it("последний: в рюкзак — сколько влезло, остаток — «В мешочек», «Пропадёт» нет", () => {
    v.pickup = pickupView({
      last: true,
      slots,
      taken: [{ stackKey: "custom:ore", qty: 20 }],
      bagged: [{ stackKey: "custom:ore", qty: 10 }],
    });
    const html = confirm();
    expect(html).toContain("В рюкзак");
    expect(html).toContain("В мешочек");
    expect(html).not.toContain("Пропадёт");
    expect(html.indexOf("Магический сундук")).toBeLessThan(html.indexOf("В мешочек"));
  });

  it("чужой без места: сундук — в списке «В мешочек», а не «В рюкзак»", () => {
    v.pickup = pickupView({ foreign: true, chestBagged: true });
    const html = confirm();
    expect(html).not.toContain("В рюкзак");
    expect(html.indexOf("В мешочек")).toBeLessThan(html.indexOf("Магический сундук"));
    v.lang = "en";
    expect(confirm()).toContain("Into a loot bag");
  });
});

describe("чужой открыл сундук: обе стороны, как у хозяина (30.09)", () => {
  it("собранное — плитка с числом и нажимается, купленное — приглушено; сеть хозяина видна", () => {
    v.net = {
      ...netView([stack("custom:banana", "Банан", 5, 3), stack("custom:wheat", "Пшеница", 4, 0)]),
      slots: [{ stackKey: "custom:ore", kind: "custom", name: "Руда", image: null, count: 7 }],
      used: 1,
      foreign: true,
    };
    const html = renderToStaticMarkup(<ChestOwnerPanel q={1} r={2} foreign />);
    const bag = tiles(html).slice(0, 2);
    expect(bag[0]).not.toContain("pointer-events-none");
    expect(bag[0]).toContain(">3</span>");
    expect(bag[1]).toContain("pointer-events-none opacity-40");
    expect(html).toContain("Руда");
  });
});

describe("тексты сундука на двух языках", () => {
  it("отказ «только собранное», строка про раненую охрану и подтверждение — ru и en", () => {
    for (const key of [
      "chest.not_mob",
      "chest.guard_wounded",
      "chest.last_confirm",
      "chest.to_bag",
      "chest.no_plunder",
      "chest.lifted_bag_toast",
      "pass.open",
      "pass.closed",
      "bag.decor",
      "bag.discarded",
      "bag.discard_off_map",
    ]) {
      expect(dict[key]?.ru, key).toBeTruthy();
      expect(dict[key]?.en, key).toBeTruthy();
    }
    // Отказ не выдаёт себя за «купленное»: старый безымянный товар тоже не собран.
    expect(dict["chest.not_mob"].ru).toBe("В сундук кладётся только собранное");
  });
});
