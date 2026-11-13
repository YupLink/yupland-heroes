// Черновик формы «Новый промокод»: проверки до запроса — те же ключи, что у
// сервера; токен — только с объёмом; правка черновика — новый ключ нажатия.
import { describe, expect, it } from "vitest";
import {
  draftError,
  draftToInput,
  editDraft,
  emptyDraft,
  lineErrors,
  lineOfKind,
} from "./promoDraft";

describe("проверки строки", () => {
  it("диапазон, USDT, шанс, потолок вещей", () => {
    const line = { ...lineOfKind("token"), budget: "1000" };
    expect(line.ref).toBe("Darai");
    expect(lineErrors({ ...line, amount: "5-1" }).amount).toBe("promo.err_amount");
    expect(lineErrors({ ...line, ref: "usdt" }).ref).toBe("promo.err_usdt");
    expect(lineErrors({ ...line, chance: "0" }).chance).toBe("promo.err_chance");
    for (const k of ["pack", "custom", "boss"] as const) {
      expect(lineErrors({ ...lineOfKind(k), amount: "1-101" }).amount).toBe("promo.err_amount_max");
    }
  });

  it("токен без объёма — ошибка поля «Объём»; у ресурса объём необязателен", () => {
    expect(lineErrors(lineOfKind("token")).budget).toBe("promo.err_token_budget");
    expect(lineErrors({ ...lineOfKind("token"), budget: "500" }).budget).toBeUndefined();
    expect(lineErrors(lineOfKind("resource")).budget).toBeUndefined();
  });

  it("черновик целиком: код, первая ошибка строки", () => {
    const ok = { ...lineOfKind("token"), budget: "1000" };
    expect(draftError({ code: "a b", maxUsers: "", lines: [ok] })).toBe("promo.err_code");
    expect(draftError({ code: "", maxUsers: "", lines: [ok] })).toBeNull();
    expect(draftError({ code: "", maxUsers: "", lines: [lineOfKind("token")] })).toBe(
      "promo.err_token_budget",
    );
  });
});

describe("ключ нажатия «Создать»", () => {
  it("любая правка черновика — новый ключ; без правок ключ тот же", () => {
    let n = 0;
    const next = () => `op${++n}`;
    const st0 = { draft: emptyDraft(), opId: "op0" };
    const st1 = editDraft(st0, { code: "AUTUMN" }, next);
    expect(st1).toMatchObject({ opId: "op1", draft: { code: "AUTUMN" } });
    const st2 = editDraft(st1, { maxUsers: "5" }, next);
    expect(st2.opId).toBe("op2");
    expect(st2.draft).toMatchObject({ code: "AUTUMN", maxUsers: "5" });
    expect(st0.opId).toBe("op0");
  });
});

describe("черновик → вход ручки", () => {
  it("шанс «12,5», пустой объём и предел — null", () => {
    const line = { ...lineOfKind("resource"), amount: " 1-10 ", chance: "12,5" };
    expect(draftToInput({ code: " autumn ", maxUsers: "", lines: [line] }, "op123456")).toEqual({
      code: "AUTUMN",
      maxUsers: null,
      opId: "op123456",
      lines: [
        {
          kind: "resource",
          ref: "gold",
          title: null,
          image: null,
          amount: "1-10",
          chance: 12.5,
          budget: null,
        },
      ],
    });
  });
});
