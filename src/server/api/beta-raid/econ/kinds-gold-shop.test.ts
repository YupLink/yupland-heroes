// Покупка золота (§8.66) в «Экономике»: деньги со счёта — покупка в магазине
// игры, купленное золото — ввод извне (как паки и пополнение звёздами).
import { describe, expect, it } from "vitest";
import { groupOfKind } from "./kinds";

describe("покупка золота в отчётах", () => {
  it("списание со счёта по ключу gshop: — trade_buy", () => {
    expect(groupOfKind("acc", "acc_spend", "gshop:acc_A:gold_1k:op_12345678")).toBe("trade_buy");
  });
  it("золото gold_shop — deposit", () => {
    expect(groupOfKind("res", "gold_shop", "gshop:acc_A:gold_1k:op_12345678")).toBe("deposit");
  });
});
