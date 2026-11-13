// Рыбу принимает ратуша острова (владелец, 21.10.2026): все четыре рыбы —
// товары ратуши, определение — самое частое у ратуш мира, своих чисел нет.
import { describe, expect, it } from "vitest";
import { ISLAND_FISH, fishGoodsOf, withFish } from "./townFish";

const good = (refId: string, marketPrice: number, producePerDay: number, id = `g_${refId}`) => ({
  id,
  kind: "custom",
  refId,
  token: null,
  operation: "both",
  marketPrice,
  consumePerResident: 0.02,
  producePerDay,
});
const [plain, rare, gold, legend] = ISLAND_FISH;
const templates = [
  { goods: [good(plain, 0.2, 10), good("cst_bread", 5, 3)] },
  { goods: [good(plain, 0.2, 10), good(plain, 0.3, 5, "dup")] },
  { goods: [good(plain, 0.3, 5), good(rare, 10, 1), good(gold, 50, 1), good(legend, 100, 1)] },
];

describe("рыба в ратуше острова", () => {
  it("по каждой рыбе — самое частое определение мира, цена — в 10 раз ниже (22.10)", () => {
    const fish = fishGoodsOf(templates);
    expect(fish.map((f) => [f.refId, f.marketPrice, f.producePerDay])).toEqual([
      [plain, 0.02, 10],
      [rare, 1, 1],
      [gold, 5, 1],
      [legend, 10, 1],
    ]);
    expect(fish.every((f) => f.operation === "both" && String(f.id).startsWith("isle_fish_"))).toBe(
      true,
    );
  });

  it("недостающая рыба добавляется, у рыбы шаблона — цена острова, остальное своё", () => {
    const fish = fishGoodsOf(templates);
    const cfg = withFish(
      { name: "Ла-Вель", goods: [good(plain, 0.2, 100), good("cst_bread", 5, 3)] },
      fish,
    );
    const refs = (cfg.goods as Array<{ refId: string }>).map((g) => g.refId);
    expect(refs).toEqual([plain, "cst_bread", rare, gold, legend]);
    const first = (
      cfg.goods as Array<{ producePerDay: number; marketPrice: number; id: string }>
    )[0];
    expect([first.producePerDay, first.marketPrice, first.id]).toEqual([100, 0.02, `g_${plain}`]);
    expect((cfg.goods as Array<{ marketPrice: number }>)[1].marketPrice).toBe(5);
    expect(withFish({ name: "x", goods: undefined }, fish).goods).toHaveLength(4);
  });

  it("рыбы нет ни в одном шаблоне — не выдумываем", () => {
    expect(fishGoodsOf([{ goods: [good("cst_bread", 5, 3)] }])).toEqual([]);
  });
});
