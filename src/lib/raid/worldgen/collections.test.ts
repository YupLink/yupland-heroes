// Коллекции рас (владелец, 07.10.2026: «если деревня единорогов — то только
// постройки из их коллекции»): только рабочие и ходовые на образце постройки,
// каждая в облике расы; ратуша всегда; без лавки расы города нет; раса — по
// земле под городом.
import { describe, expect, it } from "vitest";
import { onTerrain, raceTownFor, raceTowns, skinAt } from "./collections";
import type { RoleOption } from "@/lib/raid/zonegen/town/types";

const opt = (o: Partial<RoleOption> & Pick<RoleOption, "id" | "role">): RoleOption => ({
  name: o.id,
  effect: "market",
  tiers: 1,
  needsConfig: false,
  skins: [],
  ...o,
});
const skin = (id: string, race: string) => ({ id, name: id, races: [race] });

const CATALOG: RoleOption[] = [
  opt({
    id: "hall",
    role: "town_hall",
    effect: "town_hall",
    skins: [skin("hall_dragon", "Дракон")],
  }),
  opt({ id: "hall_dup", role: "town_hall", effect: "town_hall" }),
  opt({
    id: "tavern",
    role: "tavern",
    effect: "tavern",
    skins: [skin("tav_boar", "Кабан"), skin("tav_dragon", "Дракон")],
  }),
  opt({
    id: "temple",
    role: "temple",
    effect: "boost",
    skins: [skin("tmp_boar", "Кабан"), skin("tmp_dragon", "Дракон")],
  }),
  opt({
    id: "rest",
    role: "chambers",
    effect: "chambers",
    skins: [skin("house_boar_1", "Кабан"), skin("house_boar_2", "Кабан")],
  }),
  // «Лавка» без функции — папка обликов лавок; её облики одевают рабочие рынки.
  opt({ id: "shop_folder", role: "market", effect: null, skins: [skin("shop_boar", "Кабан")] }),
  opt({ id: "market_a", role: "market" }),
  opt({ id: "market_b", role: "market" }),
  opt({ id: "dragon_shop", role: "market", races: ["Дракон"], terrains: ["swamp"] }),
  opt({ id: "barracks", role: "barracks", skins: [skin("bar_boar", "Кабан")] }),
  opt({ id: "forge", role: "forge", effect: null, skins: [skin("forge_boar", "Кабан")] }),
];
const USAGE = new Map([
  ["hall", 33],
  ["hall_dup", 2],
  ["tavern", 20],
  ["temple", 20],
  ["rest", 30],
  ["market_a", 25],
  ["market_b", 5],
  ["dragon_shop", 6],
  ["barracks", 19],
]);

const towns = raceTowns(CATALOG, USAGE);
const of = (race: string) => towns.find((t) => t.race === race);
const ids = (race: string) => (of(race)?.options ?? []).map((o) => o.id).sort();

describe("коллекции рас", () => {
  it("в город расы — только рабочие ходовые постройки в её обликах", () => {
    // Кузница без функции, казарма с витриной админа, дубль ратуши — мимо.
    expect(ids("Кабан")).toEqual(["hall", "market_a", "rest", "tavern", "temple"]);
    const boar = of("Кабан")!;
    expect(boar.options.find((o) => o.id === "temple")?.skins?.map((s) => s.id)).toEqual([
      "tmp_boar",
    ]);
    expect(boar.options.find((o) => o.id === "rest")?.skins).toHaveLength(2);
  });

  it("облик лавки из папки одевает ходовой рынок — по одному облику на рынок", () => {
    const shop = of("Кабан")!.options.find((o) => o.role === "market");
    expect(shop).toMatchObject({ id: "market_a", skins: [{ id: "shop_boar" }] });
  });

  it("ратуша — в каждой коллекции: своя у расы или обычная", () => {
    expect(of("Дракон")!.options.find((o) => o.role === "town_hall")?.skins?.[0]?.id).toBe(
      "hall_dragon",
    );
    expect(of("Кабан")!.options.find((o) => o.role === "town_hall")?.skins).toEqual([]);
  });

  it("постройка самой расы — в своей картинке; её земля — земля расы", () => {
    expect(of("Дракон")!.options.find((o) => o.id === "dragon_shop")?.skins).toEqual([]);
    expect(of("Дракон")!.terrains).toEqual(["swamp"]);
  });

  it("без лавки и трёх служб расы город не собрать", () => {
    const thin = raceTowns(
      CATALOG.filter((o) => o.id !== "shop_folder"),
      USAGE,
    );
    expect(thin.map((t) => t.race)).toEqual(["Дракон"]);
  });
});

describe("раса города по земле", () => {
  it("на земле расы — её город; там, где её лавка не встанет, — не её", () => {
    expect(raceTownFor(towns, 1, "swamp")?.race).toBe("Дракон");
    for (let seed = 0; seed < 20; seed++)
      expect(raceTownFor(towns, seed, "grass")?.race).toBe("Кабан");
    expect(onTerrain(of("Дракон")!, "grass").some((o) => o.id === "dragon_shop")).toBe(false);
  });

  it("никто не встанет — null (старый справочник)", () => {
    expect(raceTownFor([], 1, "grass")).toBeNull();
  });
});

describe("облик по клетке", () => {
  it("одна клетка — один облик; разные клетки — разные дома", () => {
    const rest = of("Кабан")!.options.find((o) => o.id === "rest");
    expect(skinAt(rest, 5, 1, 1)).toBe(skinAt(rest, 5, 1, 1));
    const seen = new Set(Array.from({ length: 20 }, (_, i) => skinAt(rest, 5, i, 2 * i)));
    expect(seen.size).toBe(2);
    expect(skinAt(undefined, 5, 1, 1)).toBeNull();
  });
});
