// Зелья «Зелий скорости» в форме черновика: по умолчанию — «Дурман зелье»
// (подставляется, когда справочник пришёл, а не в миг клика), в выборе —
// только зелья со скоростью, в сохранение список уходит только у этой
// категории.
import { describe, expect, it } from "vitest";
import type { CustomItem } from "@/server/api/beta-raid/market-custom";
import {
  defaultPotions,
  isSpeedPotion,
  potionFill,
} from "@/components/admin/tournaments/tourPotions";
import { emptyTourDraft, savePayload } from "@/components/admin/tournaments/tourDraft";

const spd = [{ stat: "spd", value: "8", minutes: "30" }];
const item = (id: string, name: string, isPotion: boolean, boost: unknown = spd) =>
  ({ id, name, isPotion, boost }) as CustomItem;

const LIST = [
  item("cst_d", "Дурман зелье", true),
  item("cst_g", "Газировка Товарища", true),
  item("cst_h", "Зелье здоровья", true, [{ stat: "hp", value: "5", minutes: "30" }]),
  item("cst_x", "Дурман-трава", false),
];

describe("зелья турнира в форме", () => {
  it("по умолчанию — «Дурман зелье», и только зелье со скоростью", () => {
    expect(defaultPotions(LIST)).toEqual(["cst_d"]);
  });

  it("в выборе — только зелья со скоростью: зелья здоровья и не-зелий нет", () => {
    expect(LIST.filter(isSpeedPotion).map((c) => c.id)).toEqual(["cst_d", "cst_g"]);
  });

  it("«Дурман» подставляется, когда справочник пришёл; выбор «все» не трогается", () => {
    // Клик по категории до ответа справочника — пока ничего, «все» не записывается.
    expect(potionFill(undefined, undefined)).toBeNull();
    expect(potionFill(undefined, LIST)).toEqual(["cst_d"]);
    expect(potionFill([], LIST)).toBeNull();
    expect(potionFill(["cst_g"], LIST)).toBeNull();
  });

  it("список зелий уходит на сервер только у «Зелий скорости»", () => {
    const d = { ...emptyTourDraft(), name: "Рыбаки", items: ["cst_d"] };
    expect(savePayload({ ...d, metric: "potion_drink" }).items).toEqual(["cst_d"]);
    expect(savePayload({ ...d, metric: "fish_sell" }).items).toEqual([]);
  });
});
