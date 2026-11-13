// Постановка шахты глазами игрока (§8.59.8): «Поставить» есть у заготовок всех
// четырёх шахт (золотая и алмазная — на жилу, 21.10.2026), включает режим
// стройки на карте; сундуки — как раньше. Админу — «Природа» в сводке меток декора.
// Тексты ru+en. Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BackpackStack, BackpackView } from "@/server/api/beta-raid/market-backpack";
import { dict } from "@/lib/translations";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/server/api/beta-raid/mine-place/mine-place", () => ({
  placeMineBlueprint: () => Promise.reject(new Error("в тесте сети нет")),
}));
vi.mock("@/server/api/beta-raid/asset-tags", () => ({
  adminGetAssetTags: () => Promise.reject(new Error("в тесте — из кэша")),
  adminSetAssetTags: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { placeKindOf, placeableKeys } = await import("@/components/beta-raid/backpackPlace");
const { BackpackPlacePicker } = await import("@/components/beta-raid/BackpackPlacePicker");
const { MineBuildRequest } = await import("@/components/beta-raid/mine-build/MineBuildRequest");
const { PlainChestPlacePicker } =
  await import("@/components/beta-raid/plain-chest/PlainChestPlacePicker");
const { ChestPlacePicker } = await import("@/components/beta-raid/chest/ChestPlacePicker");
const { BackpackGrid } = await import("@/components/beta-raid/BackpackGrid");
const { AdminTagChecks } = await import("@/components/beta-raid/AdminTagChecks");
const { refreshAfterMinePlace } = await import("@/components/beta-raid/mine-place/minePlaceLive");

const stack = (over: Partial<BackpackStack>): BackpackStack => ({
  stackKey: "custom:cst_apple",
  kind: "custom",
  name: "Яблоко",
  image: null,
  count: 1,
  cells: 1,
  potion: false,
  collected: 0,
  chest: false,
  ...over,
});
const wood = stack({ stackKey: "custom:cst_mine_bp_wood", name: "Заготовка: Лесопилка" });
const stone = stack({ stackKey: "custom:cst_mine_bp_stone", name: "Заготовка: Каменная шахта" });
const gold = stack({ stackKey: "custom:cst_mine_bp_gold", name: "Заготовка: Золотая шахта" });
const diam = stack({ stackKey: "custom:cst_mine_bp_diamonds", name: "Заготовка: Алмазная шахта" });
const plain = stack({ stackKey: "custom:cst_box", plainChest: true });
const magic = stack({ stackKey: "custom:cst_magic", chest: true });
const apple = stack({});
const all = [wood, stone, gold, diam, plain, magic, apple];

beforeEach(() => void (v.lang = "ru"));

describe("у кого «Поставить»", () => {
  it("заготовки всех четырёх шахт — шахта; сундуки — как раньше", () => {
    expect(all.map(placeKindOf)).toEqual(["mine", "mine", "mine", "mine", "plain", "chest", null]);
    expect([...placeableKeys(all)]).toEqual([
      wood.stackKey,
      stone.stackKey,
      gold.stackKey,
      diam.stackKey,
      plain.stackKey,
      magic.stackKey,
    ]);
  });

  it("окно выбора клетки — своё у каждого; шахта — режим стройки", () => {
    const pick = (key: string) =>
      BackpackPlacePicker({ stackKey: key, stacks: all, onClose: () => {} });
    const mine = pick(stone.stackKey);
    expect(mine?.type).toBe(MineBuildRequest);
    expect(mine?.props).toMatchObject({ stackKey: stone.stackKey, kind: "stone" });
    expect(pick(plain.stackKey)?.type).toBe(PlainChestPlacePicker);
    expect(pick(magic.stackKey)?.type).toBe(ChestPlacePicker);
    expect(pick(gold.stackKey)?.props).toMatchObject({ stackKey: gold.stackKey, kind: "gold" });
    expect(pick(diam.stackKey)?.props).toMatchObject({ kind: "diamonds" });
    expect(pick("custom:нет-такой")).toBeNull();
  });

  it("в рюкзаке кнопка есть у всех заготовок шахт, у яблока — нет", () => {
    const data = {
      heroId: "h1",
      heroName: "Лис",
      capacity: 8,
      occupied: 4,
      potionCapacity: 0,
      potionOccupied: 0,
      trade: 0,
      alchemy: 0,
      stacks: [wood, stone, gold, diam, apple],
    } as unknown as BackpackView;
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <BackpackGrid data={data} compartment="backpack" />
      </QueryClientProvider>,
    );
    expect(html.match(/aria-label="Поставить"/g) ?? []).toHaveLength(4);
  });
});

describe("после постановки — без F5", () => {
  it("рюкзак, энергия, чертёж, флажок, «Добыча», накопленное и окно клетки", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    refreshAfterMinePlace(qc, { q: 3, r: -1 });
    const keys = spy.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    for (const k of [
      '["my-hero-backpack"]',
      '["my-energy"]',
      '["beta-raid-mine-plan"]',
      '["beta-raid-mine-flags"]',
      '["beta-raid-harvest"]',
      '["beta-raid-mine-pendings"]',
      '["beta-raid-building",3,-1]',
    ])
      expect(keys).toContain(k);
    spy.mockClear();
    refreshAfterMinePlace(qc);
    expect(spy.mock.calls.some(([f]) => f?.queryKey?.[0] === "beta-raid-building")).toBe(false);
  });
});

describe("тексты", () => {
  it("все отказы и подписи постановки — по-русски и по-английски", () => {
    const keys = Object.keys(dict).filter((k) => k.startsWith("mineplace."));
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      expect(dict[k].ru, k).toBeTruthy();
      expect(dict[k].en, k).toBeTruthy();
    }
    expect(dict["mineplace.need_trees"].ru).toContain("{n} из {need}");
    expect(dict["mineplace.need_vein_gold"]).toEqual({
      ru: "Здесь нет золотой жилы",
      en: "No gold vein here",
    });
    expect(dict["mineplace.need_vein_diamonds"].en).toBe("No diamond vein here");
    expect(dict["tags.nature.tree"].en).toBe("Tree");
    expect(dict["tags.nature.mountain"].ru).toBe("Гора");
  });
});

describe("метки декора у админа", () => {
  const render = (nature: "tree" | "mountain" | null, kind: "decoration" | "building") => {
    const qc = new QueryClient();
    qc.setQueryData(["asset-tags", "d1"], {
      tags: { d1: { terrains: [], races: [], auto: false, nature } },
      terrains: [],
      races: [],
    });
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <AdminTagChecks refId="d1" kind={kind} />
      </QueryClientProvider>,
    );
  };

  it("природа видна в сводке; у постройки — нет", () => {
    expect(render("tree", "decoration")).toContain("Дерево");
    v.lang = "en";
    expect(render("mountain", "decoration")).toContain("Mountain");
    expect(render("mountain", "building")).not.toContain("Mountain");
    expect(render(null, "decoration")).not.toContain("Tree");
  });
});
