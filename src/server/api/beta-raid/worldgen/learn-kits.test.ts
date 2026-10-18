// Наборы городов с образца (владелец, 07.10.2026: «у всех рас всё есть — и
// ратуши свои; города названы не просто так — у входа табличка "Город
// такой-то"; радиус у города — по привязанным лавкам ± несколько клеток»).
import { describe, expect, it } from "vitest";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { learnKits, type TownCellRow } from "./learn-kits";
import { bestLabel, labelParts } from "./learn-kits-label";

const opt = (o: Partial<BuildingOption> & Pick<BuildingOption, "id" | "name">): BuildingOption => ({
  effect: null,
  tiers: 1,
  needsConfig: false,
  skins: [],
  ...o,
});
const skin = (id: string, races: string[] = []) => ({ id, name: id, races });

const CATALOG: BuildingOption[] = [
  opt({
    id: "hall",
    name: "Ратуша",
    effect: "town_hall",
    skins: [skin("hall_dragon", ["Дракон"]), skin("hall_hell"), skin("hall_boar")],
  }),
  opt({
    id: "tav",
    name: "Таверна",
    effect: "tavern",
    skins: [skin("tav_dragon", ["Дракон"]), skin("tav_boar", ["Кабан"]), skin("tav_hell")],
  }),
  opt({ id: "tmp", name: "Храм", effect: "boost", skins: [skin("tmp_dragon", ["Дракон"])] }),
  opt({ id: "mkt", name: "Продуктовый - Рынок", effect: "market" }),
  // Папка обликов лавок без функции: облики встают на рынок, где их ставят на образце.
  opt({
    id: "shop_folder",
    name: "Лавка",
    skins: [skin("shop_boar", ["Кабан"]), skin("shop_hell")],
  }),
  opt({ id: "uni", name: "Университет", effect: "university", races: ["Юпик"] }),
  opt({ id: "wh", name: "Склад", effect: "warehouse", skins: [skin("wh_common")] }),
  opt({ id: "bar", name: "Казарма - Найм войнов", effect: "market" }),
  opt({ id: "dragon_shop", name: "Драконий магазин", effect: "market", races: ["Дракон"] }),
  opt({
    id: "sign",
    name: "Табличка",
    effect: "sign",
    needsConfig: true,
    skins: [skin("sign_dragon", ["Дракон"]), skin("sign_bee_statue", ["Юпик"])],
  }),
  // Группа «Арена» висит на портале — облики встают на арену, как на образце.
  opt({
    id: "portal_g",
    name: "Грибной портал",
    effect: "portal",
    needsConfig: true,
    skins: [skin("arena_hell"), skin("arena_boar", ["Кабан"])],
  }),
  opt({ id: "arena", name: "Арена", effect: "tournament" }),
];

const cell = (q: number, r: number, tpl: string, o: Partial<TownCellRow> = {}): TownCellRow => {
  const effect = CATALOG.find((c) => c.id === tpl)?.effect ?? null;
  return {
    q,
    r,
    tpl,
    skin: null,
    effect,
    text: null,
    terrain: "t",
    townQ: null,
    townR: null,
    name: null,
    ...o,
  };
};
const sign = (q: number, r: number, text: string, s: string | null = null) =>
  cell(q, r, "sign", { text, skin: s });

const ROWS: TownCellRow[] = [
  // Драконий город A: лавка в двух шагах — радиус 2 + 3.
  cell(0, 0, "hall", { skin: "hall_dragon", name: "Куна", terrain: "t_dragon" }),
  cell(2, 0, "mkt", { townQ: 0, townR: 0, terrain: "t_dragon" }),
  cell(1, 1, "tav", { skin: "tav_dragon" }),
  cell(0, 2, "tmp", { skin: "tmp_dragon" }),
  cell(3, 0, "wh", { skin: "wh_common" }),
  cell(0, 3, "uni"),
  cell(1, 0, "bar"),
  cell(6, 0, "wh", { skin: "wh_far" }),
  cell(0, -2, "mkt", { effect: "spellbook" }),
  sign(4, -1, "Город Драконов - Куна", "sign_dragon"),
  sign(0, 30, "Город Драконов - Куна", "sign_dragon"),
  // Драконий город B: лавок нет — радиус по умолчанию.
  cell(40, 0, "hall", { skin: "hall_dragon", name: "Град" }),
  cell(41, 0, "dragon_shop"),
  cell(45, 0, "wh", { skin: "wh_common" }),
  sign(43, 0, "Военый городок - Град"),
  // Адский город: рас нет.
  cell(80, 0, "hall", { skin: "hall_hell", name: "Логос", terrain: "t_hell" }),
  cell(81, 0, "tav", { skin: "tav_hell" }),
  cell(82, 0, "mkt", { skin: "shop_hell", townQ: 80, townR: 0 }),
  cell(80, 1, "wh", { skin: "wh_common" }),
  cell(81, 1, "arena", { skin: "arena_hell" }),
  sign(83, 0, "Город Ада - Логос"),
  // Кабаний город: облик ратуши без метки — раса по постройкам.
  cell(120, 0, "hall", { skin: "hall_boar", name: "Башка" }),
  cell(121, 0, "tav", { skin: "tav_boar" }),
  cell(122, 0, "mkt", { townQ: 120, townR: 0 }),
  sign(130, 0, "Город Кабанов - ЛиРа"),
  // «Город Пчёл» в поле: ни ратуши рядом, ни пчелиного набора.
  sign(200, 0, "Город Пчел - Рой", "sign_bee_statue"),
];

const kits = learnKits(ROWS, CATALOG);
const kit = (id: string) => kits.find((k) => k.id === id);
const looks = (id: string) => (kit(id)?.looks ?? []).map((l) => `${l.t}/${l.s ?? ""}`).sort();

describe("наборы городов по облику ратуши", () => {
  it("набор — облик ратуши; раса — метка ратуши или постройки города", () => {
    expect(kits.map((k) => k.id)).toEqual(["hall_boar", "hall_dragon", "hall_hell"]);
    expect(kit("hall_dragon")?.race).toBe("Дракон");
    expect(kit("hall_boar")?.race).toBe("Кабан");
    expect(kit("hall_hell")?.race).toBeNull();
    expect(kit("hall_dragon")?.towns).toEqual(["Град", "Куна"]);
  });

  it("в наборе — рабочие постройки в радиусе лавок, своей расы или без расы", () => {
    // Юпиковский университет, казарма-витрина, своя функция клетки, дальний склад — мимо.
    expect(looks("hall_dragon")).toEqual([
      "dragon_shop/",
      "mkt/",
      "tav/tav_dragon",
      "tmp/tmp_dragon",
      "wh/wh_common",
    ]);
    const wh = kit("hall_dragon")?.looks.find((l) => l.t === "wh");
    expect(wh).toMatchObject({ n: 2, own: false });
    expect(kit("hall_dragon")?.looks.find((l) => l.t === "tav")?.own).toBe(true);
  });

  it("расовый набор, которого нет в городах, — в домашний набор расы, на шаблон группы с образца", () => {
    expect(looks("hall_boar")).toEqual([
      "arena/arena_boar",
      "mkt/",
      "mkt/shop_boar",
      "tav/tav_boar",
    ]);
    expect(kit("hall_boar")?.looks.find((l) => l.s === "shop_boar")).toMatchObject({
      n: 0,
      own: true,
    });
  });

  it("подпись — с табличек ратуши; с именем расы важнее; облик — как у этих табличек", () => {
    expect(kit("hall_dragon")?.label).toBe("Город Драконов");
    expect(kit("hall_dragon")?.sign).toEqual({ t: "sign", s: "sign_dragon" });
    expect(kit("hall_hell")?.label).toBe("Город Ада");
    expect(kit("hall_boar")?.label).toBe("Город Кабанов");
    expect(kit("hall_boar")?.sign).toEqual({ t: "sign", s: null });
  });

  it("земли набора — под его городами", () => {
    expect(kit("hall_hell")?.terrains.map((t) => t.id)).toEqual(["t", "t_hell"]);
  });

  it("ратуш на образце нет — наборов нет", () => {
    expect(
      learnKits(
        ROWS.filter((r) => r.tpl !== "hall"),
        CATALOG,
      ),
    ).toEqual([]);
  });
});

describe("подпись с таблички", () => {
  it("часть со словом «город» без имени самого города", () => {
    expect(labelParts("Город Драконов - Куна", ["Куна"])).toEqual(["Город Драконов"]);
    expect(labelParts("Ирий - город надежд", ["Ирий"])).toEqual(["Город надежд"]);
    expect(labelParts("Город Сантария - Горные хребты", ["Сантария"])).toEqual([]);
    expect(labelParts("Город - Мана", [])).toEqual([]);
    expect(labelParts("Банановая Ферма", [])).toEqual([]);
  });

  it("подпись с именем расы важнее частой", () => {
    const parts = ["Военый городок", "Военый городок", "Город Драконов"];
    expect(bestLabel(parts, "Дракон")).toBe("Город Драконов");
    expect(bestLabel(parts, null)).toBe("Военый городок");
    expect(bestLabel([], null)).toBeNull();
  });
});
