import { describe, expect, it } from "vitest";
import {
  TOUR_RULES,
  TOUR_RULES_ITEMS_KEY,
  TOUR_RULES_JOIN_KEY,
  TOUR_RULES_TIE_KEY,
} from "@/lib/tournament/metricRules";
import { TOUR_METRICS } from "./types";
import { dict } from "@/lib/translations/tournament-rules";

const has = (key: string): boolean => key in dict;

describe("условия турниров", () => {
  it("у каждой категории есть хотя бы один пункт «засчитывается»", () => {
    for (const m of TOUR_METRICS) expect(TOUR_RULES[m].yes.length).toBeGreaterThan(0);
  });

  it("каждый пункт есть в словаре на ru и en", () => {
    const keys = TOUR_METRICS.flatMap((m) => [...TOUR_RULES[m].yes, ...TOUR_RULES[m].no]);
    keys.push(TOUR_RULES_JOIN_KEY, TOUR_RULES_TIE_KEY, "tour.rules.yes", "tour.rules.no");
    keys.push(TOUR_RULES_ITEMS_KEY);
    for (const key of keys) {
      expect(has(key), key).toBe(true);
      const v = dict[key as keyof typeof dict];
      expect(v.ru.trim(), key).not.toBe("");
      expect(v.en.trim(), key).not.toBe("");
    }
  });

  it("склад, сундук и мешочек не засчитываются в дерево и камень", () => {
    expect(TOUR_RULES.wood.no).toContain("tour.rules.res.n2");
    expect(TOUR_RULES.stone.no).toContain("tour.rules.res.n2");
  });
});

describe("условия турнира рыбаков", () => {
  it("продажа рыбы: своя грядка и купленная в плюс — да; чужая, продажа до записи, бокс — нет; чужое зелье — нет", () => {
    expect(TOUR_RULES.fish_sell.yes).toContain("tour.rules.fish_sell.y3");
    expect(dict["tour.rules.fish_sell.y1"].ru).toContain("грядке");
    // Своё — когда бы ни пришло (владелец, 14.10.2026: «да, засчитывай все»).
    expect(dict["tour.rules.fish_sell.y1"].ru).toContain("до старта");
    expect(dict["tour.rules.fish_sell.y3"].ru).toContain("до старта");
    expect(dict["tour.rules.potion_drink.y2"].ru).toContain("до старта");
    expect(dict["tour.rules.fish_sell.y3"].ru).toContain("дороже, чем куплена");
    // Аукцион — от другого аккаунта (ревью 14.10.2026, tour-own-auction.ts).
    expect(dict["tour.rules.fish_sell.n2"].ru).toContain("аукцион");
    expect(dict["tour.rules.potion_drink.n1"].en).toContain("auction");
    expect(dict["tour.rules.fish_sell.y3"].ru).toContain("в плюсе");
    expect(dict["tour.rules.fish_sell.n3"].ru).toContain("продажа до записи");
    expect(dict["tour.rules.potion_drink.n3"].ru).toContain("выпитое до записи");
    expect(TOUR_RULES.fish_sell.no).toEqual(
      expect.arrayContaining([
        "tour.rules.fish_sell.n1",
        "tour.rules.fish_sell.n2",
        "tour.rules.fish_sell.n3",
        "tour.rules.fish_sell.n5",
      ]),
    );
    expect(TOUR_RULES.potion_drink.no).toContain("tour.rules.potion_drink.n1");
    // Сваренное самим — своё из любой рыбы и вёдер (владелец, 14.10.2026): пункта
    // «из чужой рыбы» больше нет.
    expect(TOUR_RULES.potion_drink.no).not.toContain("tour.rules.potion_drink.n4");
    expect("tour.rules.potion_drink.n4" in dict).toBe(false);
    expect(dict["tour.rules.potion_drink.y2"].ru).toContain("из любой рыбы и вёдер");
    expect(dict["tour.rules.potion_drink.y2"].en).toContain("from any fish and buckets");
    expect(dict[TOUR_RULES_ITEMS_KEY].ru).toContain("{items}");
    expect(dict[TOUR_RULES_ITEMS_KEY].en).toContain("{items}");
  });
});
