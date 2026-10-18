// Тесты математики россыпи: `bun run test`.
//
// Проверок ровно те же 16, что были у самодельного раннера, — сменилась только
// обвязка. Помощники (ok/eq/near) оставлены: в них лежат ПРИЧИНЫ падения
// («сумма 1000.01 больше фонда 1000»), а голый expect на массиве из ста долей
// показывает только массив.
import { describe, expect, it } from "vitest";
import { autoPileCount, raffleItems, rollPiles, splitFundByLevels } from "@/lib/raid/scatterMath";
import { seeded } from "@/test/seeded";

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const show = (xs: number[]) => `[${xs.join(", ")}]`;
// Сложение float даёт шум ~1e-16 на слагаемое; сами доли ровные до сотых.
const NOISE = 1e-9;

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};
const eq = (a: number, b: number, msg: string) => ok(a === b, `${msg}: ${a}, ждали ${b}`);
const near = (a: number, b: number, tol: number, msg: string) =>
  ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (допуск ${tol})`);
const okAll = (xs: number[], p: (v: number) => boolean, msg: string) =>
  ok(xs.every(p), `${msg}: ${show(xs)}`);
const sane = (xs: number[], msg: string) => okAll(xs, Number.isFinite, `${msg} — NaN/Infinity`);
const inFund = (xs: number[], fund: number) =>
  ok(sum(xs) <= fund + NOISE, `сумма ${sum(xs)} больше фонда ${fund}`);

describe("splitFundByLevels", () => {
  it("сумма никогда не больше фонда (200 прогонов)", () => {
    const rnd = seeded(1);
    for (let run = 0; run < 200; run++) {
      const n = 1 + Math.floor(rnd() * 40);
      const levels = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 20));
      const fund = Math.round(rnd() * 1e8);
      const out = splitFundByLevels(levels, fund, { rnd });
      sane(out, "доли боссов");
      inFund(out, fund);
      okAll(out, (v) => v >= 0, "отрицательная доля");
    }
  });

  it("средняя доля пропорциональна уровню", () => {
    const rnd = seeded(7);
    const acc = [0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      splitFundByLevels([20, 10, 5], 1_000_000, { rnd }).forEach((v, k) => (acc[k] += v));
    }
    // Пропорция 20:10:5 = 4:2:1. Ужимание перебора бьёт всех одинаково, поэтому
    // отношения средних сохраняются; допуск 8% — на шум выборки.
    near(acc[0] / acc[1], 2, 0.16, "уровень 20 против 10");
    near(acc[1] / acc[2], 2, 0.16, "уровень 10 против 5");
  });

  it("100 млн на 100 боссов 10–20 lvl укладывается в фонд", () => {
    const rnd = seeded(42);
    const levels = Array.from({ length: 100 }, () => 10 + Math.floor(rnd() * 11));
    const out = splitFundByLevels(levels, 100_000_000, { rnd });
    eq(out.length, 100, "боссов на выходе");
    inFund(out, 100_000_000);
    const onGrid = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    okAll(out, onGrid, "доли не округлены до сотых");
  });

  it("вырожденные входы не падают", () => {
    eq(splitFundByLevels([], 1000, { rnd: seeded(3) }).length, 0, "пустые уровни");
    const zero = splitFundByLevels([10, 20], 0, { rnd: seeded(3) });
    eq(zero.length, 2, "фонд 0 не меняет длину");
    okAll(zero, (v) => v === 0, "фонд 0 должен дать нули");
    okAll(splitFundByLevels([10, 20], -500, { rnd: seeded(3) }), (v) => v === 0, "фонд < 0");
    const nan = splitFundByLevels([10, 20], Number.NaN, { rnd: seeded(3) });
    sane(nan, "фонд NaN");
    okAll(nan, (v) => v === 0, "фонд NaN должен дать нули");
    // Мусор в уровнях (минус, NaN, Infinity) — тот же вырожденный вход.
    const trash = splitFundByLevels([10, -5, Number.NaN, Infinity], 1000, { rnd: () => 1 });
    sane(trash, "мусорные уровни");
    inFund(trash, 1000);
    ok(trash[1] === 0 && trash[2] === 0 && trash[3] === 0, `мусор в доле: ${show(trash)}`);
  });

  it("все уровни нулевые — фонд делится поровну", () => {
    // Сравнивать боссов не по чему, но и сжигать фонд незачем: база у всех одна.
    const rnd = seeded(11);
    const acc = [0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      const out = splitFundByLevels([0, 0, 0, 0], 1000, { rnd });
      eq(out.length, 4, "длина при нулевых уровнях");
      inFund(out, 1000);
      out.forEach((v, k) => (acc[k] += v));
    }
    near(acc[0] / acc[3], 1, 0.12, "нулевые уровни должны быть равнозначны");
  });

  it("свой округлитель даёт целые и не ломает потолок", () => {
    const rnd = seeded(5);
    for (let run = 0; run < 100; run++) {
      const out = splitFundByLevels([7, 3, 1], 101, { round: Math.round, rnd });
      okAll(out, Number.isInteger, "не целые");
      ok(sum(out) <= 101, `сумма ${sum(out)} больше 101`);
    }
  });
});

describe("raffleItems", () => {
  it("раздаёт ровно items штук", () => {
    const rnd = seeded(21);
    for (let run = 0; run < 300; run++) {
      const n = 1 + Math.floor(rnd() * 30);
      const items = Math.floor(rnd() * 90);
      const out = raffleItems(n, items, rnd);
      eq(out.length, n, "длина раздачи");
      eq(sum(out), items, `раздали не всё при ${n} участниках`);
      okAll(out, (v) => Number.isInteger(v) && v >= 0, "битые штуки");
    }
  });

  it("предметов больше участников — раздача равномерная ±1", () => {
    const out = raffleItems(4, 10, seeded(2));
    eq(sum(out), 10, "сумма");
    eq(Math.max(...out) - Math.min(...out), 1, "разброс больше единицы");
    eq(Math.min(...out), 2, "минимум");
  });

  it("приоритет у большего броска", () => {
    // Броски 0.1 / 0.9 / 0.5 → единственный предмет уходит второму участнику.
    const rolls = [0.1, 0.9, 0.5];
    let i = 0;
    const rnd = () => rolls[i++] ?? 0;
    const one = raffleItems(3, 1, rnd);
    ok(one.join(",") === "0,1,0", `предмет ушёл не лидеру: ${show(one)}`);
    i = 0;
    const four = raffleItems(3, 4, rnd);
    ok(four.join(",") === "1,2,1", `лишний ушёл не лидеру: ${show(four)}`);
  });

  it("вырожденные входы и битый генератор", () => {
    eq(raffleItems(0, 5, seeded(1)).length, 0, "ноль участников");
    eq(raffleItems(-3, 5, seeded(1)).length, 0, "отрицательные участники");
    ok(raffleItems(3, 0, seeded(1)).join(",") === "0,0,0", "ноль предметов");
    ok(raffleItems(3, Number.NaN, seeded(1)).join(",") === "0,0,0", "items = NaN");
    const frac = raffleItems(3, 2.7, seeded(1));
    sane(frac, "дробные items");
    eq(sum(frac), 2, "дробные items округляются вниз");
    const broken = raffleItems(4, 6, () => Number.NaN);
    sane(broken, "NaN-генератор");
    eq(sum(broken), 6, "сумма при NaN-генераторе");
  });
});

describe("rollPiles", () => {
  it("сумма ≤ фонда, каждая кучка в [1, cap]", () => {
    const rnd = seeded(33);
    for (let run = 0; run < 300; run++) {
      const fund = Math.round(rnd() * 500_000);
      const count = 1 + Math.floor(rnd() * 200);
      const cap = 1 + Math.round(rnd() * 20_000);
      const out = rollPiles(count, fund, cap, { rnd });
      sane(out, "кучки");
      inFund(out, fund);
      ok(out.length <= count, `кучек больше заказанного: ${out.length} > ${count}`);
      okAll(out, (v) => v >= 1 && v <= cap, `кучка вне [1, ${cap}]`);
    }
  });

  it("потолок шаблона и нехватка фонда", () => {
    // Фонд 1 000 000 на 10 кучек = средняя 100 000, но шаблон держит 500.
    const capped = rollPiles(10, 1_000_000, 500, { rnd: seeded(4) });
    eq(capped.length, 10, "кучек под потолком");
    okAll(capped, (v) => v <= 500, "потолок пробит");
    // Просили 200 кучек на фонд 50: каждой нужна монета, значит кучек будет 50.
    const poor = rollPiles(200, 50, 10, { rnd: seeded(6) });
    eq(poor.length, 50, "кучек при фонде 50");
    okAll(poor, (v) => v === 1, "каждой должно достаться ровно по монете");
    eq(sum(poor), 50, "фонд роздан без остатка");
  });

  it("вырожденные входы", () => {
    eq(rollPiles(0, 1000, 100, { rnd: seeded(1) }).length, 0, "count = 0");
    eq(rollPiles(10, 0, 100, { rnd: seeded(1) }).length, 0, "фонд 0");
    eq(rollPiles(10, 0.5, 100, { rnd: seeded(1) }).length, 0, "фонд меньше монеты");
    eq(rollPiles(10, Number.NaN, 100, { rnd: seeded(1) }).length, 0, "фонд NaN");
    eq(rollPiles(10, 1000, 0.5, { rnd: seeded(1) }).length, 0, "потолок ниже монеты");
    // Потолок ≤ 0 = «поле не заполнено», ограничения нет.
    const noCap = rollPiles(5, 1000, 0, { rnd: seeded(1) });
    eq(noCap.length, 5, "потолок 0 = без потолка");
    inFund(noCap, 1000);
    sane(rollPiles(5, 1000, Number.NaN, { rnd: seeded(1) }), "потолок NaN");
  });

  it("раздаётся почти весь фонд", () => {
    // Бросок [1, 2n] даёт матожидание n + 0.5, перебор срезает потолок фонда:
    // в среднем уходит чуть меньше фонда, а не половина.
    const rnd = seeded(8);
    let acc = 0;
    for (let i = 0; i < 300; i++) acc += sum(rollPiles(100, 1_000_000, 1_000_000, { rnd }));
    const mean = acc / 300;
    ok(mean <= 1_000_000, `средняя раздача ${mean} выше фонда`);
    ok(mean > 900_000, `средняя раздача ${mean} подозрительно мала`);
  });
});

it("autoPileCount: фонд / 10к, не меньше 1", () => {
  eq(autoPileCount(1_000_000), 100, "1 млн");
  eq(autoPileCount(10_000), 1, "ровно 10к");
  eq(autoPileCount(5_000), 1, "меньше 10к — всё равно кучка");
  eq(autoPileCount(19_999), 1, "округление вниз");
  eq(autoPileCount(0), 0, "нет фонда — нет кучек");
  eq(autoPileCount(-100), 0, "отрицательный фонд");
  eq(autoPileCount(Number.NaN), 0, "фонд NaN");
  eq(autoPileCount(Number.POSITIVE_INFINITY), 0, "фонд Infinity");
  // Потолок группы (MAX_PER_GROUP = 5000) стоит по умолчанию: без него фонд с
  // верхней границы схемы просил бы сто миллионов кучек и ронял предпросмотр.
  eq(autoPileCount(1e12), 5000, "гигантский фонд режется потолком группы");
  eq(autoPileCount(1e12, Number.POSITIVE_INFINITY), 100_000_000, "явное «без потолка»");
  eq(autoPileCount(1_000_000, 10), 10, "свой потолок ниже расчётного");
  eq(autoPileCount(1_000_000, 0), 100, "потолок 0 = потолка нет");
});

it("детерминизм: одинаковый сид — одинаковый результат", () => {
  const twice = <T>(fn: (r: () => number) => T[]) => [fn(seeded(99)), fn(seeded(99))];
  const [a1, a2] = twice((r) => splitFundByLevels([5, 5, 9], 777, { rnd: r }));
  ok(a1.join("|") === a2.join("|"), `splitFundByLevels: ${show(a1)} ≠ ${show(a2)}`);
  const [b1, b2] = twice((r) => raffleItems(6, 4, r));
  ok(b1.join("|") === b2.join("|"), `raffleItems: ${show(b1)} ≠ ${show(b2)}`);
  const [c1, c2] = twice((r) => rollPiles(20, 12_345, 900, { rnd: r }));
  ok(c1.join("|") === c2.join("|"), `rollPiles: ${show(c1)} ≠ ${show(c2)}`);
});
