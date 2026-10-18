// Состав пресетов: `bun run test`.
//
// Смысл проверок — «в деревне ратуша одна», а не «в деревне ровно эти id».
// Справочник живой: шаблоны заводят и переименовывают, и состав обязан
// собираться по ролям, а не по вбитым id. Отдельная ловушка — шаблоны без
// meta.effect: «Ратуша»-декорация не должна подменять настоящую ратушу.
import { describe, expect, it } from "vitest";
import { composeSettlement, roleOfOption, ROLE_ORDER } from "@/lib/raid/zonegen/settlement-compose";
import type { BuildingOption, SettlementSlot } from "@/lib/raid/zonegen/settlement-types";

const opt = (
  id: string,
  name: string,
  effect: string | null,
  tiers = 0,
  needsConfig = false,
): BuildingOption => ({ id, name, effect, tiers, needsConfig });

/** Срез живого справочника: службы, без-эффектные шаблоны, рынки и «ненастроенные». */
const CATALOG: BuildingOption[] = [
  opt("b_hall", "Ратуша", "town_hall"),
  opt("b_hall_fake", "Ратуша", null),
  opt("b_tavern", "Таверна", "tavern", 3),
  opt("b_bar", "Бар", "tavern"),
  opt("b_wh", "Склад", "warehouse"),
  opt("b_uni", "Университет", "university", 3),
  opt("b_museum", "Музей", "museum", 4),
  opt("b_chambers", "Покои", "chambers"),
  opt("b_spell", "Столб заклинаний", "spellbook"),
  opt("b_watch", "Обзорная вышка", "watchtower", 2),
  opt("b_ship", "Верфь", "shipyard", 3),
  opt("b_temple", "Храм", "boost"),
  opt("b_forge", "Кузница", null),
  opt("b_smelt", "Плавильня", null),
  opt("b_pawn", "Ломбард", null),
  opt("b_arena", "Арена", null),
  opt("b_shop", "Лавка", null),
  opt("b_m1", "Алхимия - Рынок", "market"),
  opt("b_m2", "Пекарня", "market"),
  opt("b_m3", "Пилорама", "market"),
  opt("b_m4", "Продуктовый - Рынок", "market"),
  opt("b_m5", "Путешественника - Рынок", "market"),
  opt("b_m6", "Северный Магазин", "market"),
  opt("b_m7", "Строительный - Рынок", "market"),
  opt("b_m8", "Утилизатор", "market"),
  opt("b_m9", "Конюшня - Рынок", "market"),
  opt("b_m10", "Казарма - Найм войнов", "market"),
  opt("b_mine", "Шахта", "mine", 2, true),
  opt("b_field", "Поле", "field", 0, true),
  opt("b_portal", "Портал", "portal", 0, true),
];

const required = (slots: SettlementSlot[]) => slots.filter((s) => s.count > 0);
const background = (slots: SettlementSlot[]) => slots.filter((s) => s.fill === true);
const countOf = (slots: SettlementSlot[], id: string) =>
  slots.find((s) => s.buildingId === id)?.count ?? 0;

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};

describe("roleOfOption", () => {
  it("эффект — роль; без эффекта роль видна по имени; чужое имя — none", () => {
    expect(roleOfOption(opt("x", "Северный Бар", "tavern"))).toBe("tavern");
    expect(roleOfOption(opt("x", "Кузница", null))).toBe("forge");
    expect(roleOfOption(opt("x", " ратуша ", null))).toBe("town_hall");
    expect(roleOfOption(opt("x", "Зимняя Хижина", null))).toBe("none");
    // Ратуша — первая в порядке важности: она стоит в центре поселения.
    expect(ROLE_ORDER[0]).toBe("town_hall");
  });
});

describe("composeSettlement", () => {
  it("деревня: ратуша, таверна и склад — ровно по одной", () => {
    const slots = composeSettlement("village", CATALOG);
    expect(countOf(slots, "b_hall")).toBe(1);
    expect(countOf(slots, "b_tavern")).toBe(1);
    expect(countOf(slots, "b_wh")).toBe(1);
    expect(countOf(slots, "b_forge")).toBe(1);
    // Никакой строки по две штуки и никаких вторых таверн: «по паре каждой
    // твари» в деревне и было тем, на что жаловался владелец.
    expect(required(slots).map((s) => s.count)).toEqual([1, 1, 1, 1]);
    // Из трёх таверн справочника берём «главную» — ту, у которой есть тиры.
    expect(countOf(slots, "b_bar")).toBe(0);
  });

  it("ратуша берётся с эффектом, а не тёзка-декорация", () => {
    const slots = composeSettlement("village", CATALOG);
    expect(countOf(slots, "b_hall_fake")).toBe(0);
    // Настоящей ратуши нет — сгодится и без-эффектная тёзка: города она не
    // заведёт, но площадь поселению даст.
    const noHall = CATALOG.filter((o) => o.id !== "b_hall");
    expect(countOf(composeSettlement("village", noHall), "b_hall_fake")).toBe(1);
  });

  it("городок богаче деревни ролями, лагерь — без ратуши", () => {
    const town = composeSettlement("town", CATALOG);
    const village = composeSettlement("village", CATALOG);
    ok(
      required(town).length > required(village).length,
      `в городке ${required(town).length} служб, в деревне ${required(village).length}`,
    );
    for (const id of ["b_uni", "b_museum", "b_temple", "b_arena", "b_pawn", "b_smelt", "b_watch"]) {
      expect(countOf(town, id)).toBe(1);
    }
    const camp = composeSettlement("camp", CATALOG);
    expect(countOf(camp, "b_hall")).toBe(0);
    expect(countOf(camp, "b_hall_fake")).toBe(0);
    expect(countOf(camp, "b_tavern")).toBe(1);
  });

  it("порт: верфь, два склада и рынок путешественника", () => {
    const slots = composeSettlement("port", CATALOG);
    expect(countOf(slots, "b_ship")).toBe(1);
    expect(countOf(slots, "b_wh")).toBe(2);
    expect(countOf(slots, "b_m5")).toBe(1);
    // Рынок ушёл в обязательные — второй строкой в фоне он не задваивается.
    expect(background(slots).filter((s) => s.buildingId === "b_m5")).toEqual([]);
  });

  it("фон — рынки, не больше восьми, count 0 и fill", () => {
    const slots = composeSettlement("town", CATALOG);
    const fill = background(slots);
    expect(fill.length).toBe(8);
    for (const s of fill) {
      expect(s.count).toBe(0);
      expect(s.fill).toBe(true);
      expect(CATALOG.find((o) => o.id === s.buildingId)?.effect).toBe("market");
    }
    // Состав не должен превышать потолок рецепта в 60 строк.
    expect(slots.length).toBeLessThanOrEqual(60);
  });

  it("фон берётся со всего списка рынков, а не первыми восемью по алфавиту", () => {
    const fill = background(composeSettlement("town", CATALOG)).map((s) => s.buildingId);
    const all = CATALOG.filter((o) => o.effect === "market").sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
    // Взять голову списка значило бы, что во всех городах стоят одни и те же
    // дворы, а хвост справочника не встанет нигде.
    const head = new Set(all.slice(0, fill.length).map((o) => o.id));
    ok(
      fill.some((id) => !head.has(id)),
      `фон — та же голова алфавита: ${fill.join(",")}`,
    );
    expect(new Set(fill).size).toBe(fill.length);
  });

  it("постройки со своим конфигом в состав не попадают", () => {
    const ids = new Set(
      (["camp", "village", "town", "port"] as const).flatMap((p) =>
        composeSettlement(p, CATALOG).map((s) => s.buildingId),
      ),
    );
    for (const id of ["b_mine", "b_field", "b_portal"]) ok(!ids.has(id), `${id} попал в состав`);
  });

  it("порядок справочника состав не меняет, пустой справочник даёт пусто", () => {
    const shuffled = [...CATALOG].reverse();
    expect(composeSettlement("town", shuffled)).toEqual(composeSettlement("town", CATALOG));
    expect(composeSettlement("town", [])).toEqual([]);
    expect(composeSettlement("port", [])).toEqual([]);
  });

  it("чего нет в справочнике, того нет в составе — но состав не падает", () => {
    const poor = CATALOG.filter((o) => o.effect === "tavern" || o.effect === "market");
    const slots = composeSettlement("town", poor);
    expect(required(slots).length).toBe(1);
    expect(countOf(slots, "b_tavern")).toBe(1);
    expect(background(slots).length).toBe(8);
  });
});
