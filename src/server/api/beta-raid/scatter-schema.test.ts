// Проходная раздачи: что план ОБЯЗАН объяснить, прежде чем его исполнят.
//
// Панель отсекает мусор ещё в браузере, но ручка открыта не панели, а админу:
// запрос можно собрать руками. Здесь проверяется ровно то, чего браузер не
// гарантирует, и не проверяется вкус — схема не судья планам, она сторож.
import { describe, expect, it } from "vitest";
import { emptyPlan } from "@/test/scatterFixtures";
import { parseScatterPlan } from "./scatter-schema";

/** План с одним фондом у сундуков — короткая дорога до нужной проверки. */
const withFund = (fund: unknown): unknown => {
  const plan = emptyPlan();
  return { ...plan, chests: { ...plan.chests, enabled: true, funds: [fund] } };
};

describe("токенный фонд без символа монеты", () => {
  it("не проходит: сервер не знает, что раскладывать", () => {
    // Символ читает и выдача (encounter-rewards), и сверка с остатком
    // (scatter-funds). Безымянная строка выпадала из обеспечения молча — то
    // есть раздавалась мимо всякого учёта, — а в отчёте значилась «Токен».
    for (const token of [null, "", "   "]) {
      expect(
        () => parseScatterPlan(withFund({ kind: "token", token, amount: 1000 })),
        ["символ", JSON.stringify(token)].join(" "),
      ).toThrow(/символа монеты/);
    }
    // Поле вообще не прислали — тот же случай: по умолчанию символа нет.
    expect(() => parseScatterPlan(withFund({ kind: "token", amount: 1000 }))).toThrow(
      /символа монеты/,
    );
  });

  it("с символом проходит, и символ доезжает до плана нетронутым", () => {
    const plan = parseScatterPlan(withFund({ kind: "token", token: "USDT", amount: 12.5 }));
    // resource и itemId схема подставляет сама (default(null)) — они не про
    // токен, но в разобранном плане они есть, и сверка идёт по целой строке.
    expect(plan.chests.funds).toEqual([
      { kind: "token", token: "USDT", amount: 12.5, resource: null, itemId: null },
    ]);
  });

  it("остальным видам символ не нужен — им он и не читается", () => {
    for (const kind of ["likes", "energy", "tickets"] as const) {
      const plan = parseScatterPlan(withFund({ kind, token: null, amount: 50 }));
      expect(plan.chests.funds[0].kind).toBe(kind);
    }
  });
});

describe("схема — сторож, а не судья", () => {
  it("раздача в минус остаётся разрешённой", () => {
    // Владелец: «ограничивать админа раздавать в „-“ нельзя». Отчёт скажет об
    // этом громко и с числами, но схема не имеет права не пустить.
    const plan = parseScatterPlan(withFund({ kind: "token", token: "Darai", amount: 1e12 }));
    expect(plan.chests.funds[0].amount).toBe(1e12);
  });

  it("отказ приходит человеческой фразой, а не свалкой ZodError", () => {
    // Админ читает её тостом (humanError): JSON со списком путей ему не скажет
    // ничего, и он решит, что «раздача сломалась».
    try {
      parseScatterPlan(withFund({ kind: "token", token: null, amount: 5 }));
      expect.unreachable("план без символа монеты не должен разбираться");
    } catch (e) {
      const text = (e as Error).message;
      expect(text.startsWith("[")).toBe(false);
      expect(text).toContain("Токенный фонд без символа монеты");
    }
  });

  it("пустое количество у кучек — это «посчитай сам», а не ноль", () => {
    const plan = emptyPlan();
    const parsed = parseScatterPlan({ ...plan, coins: { ...plan.coins, count: null } });
    expect(parsed.coins.count).toBeNull();
  });
});
