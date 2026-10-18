// Кучки: дробные номиналы и бросок вокруг «среднего значения».
//
// Второй файл тестов у scatterMath намеренно: в первом лежат боссы, жребий и
// прежнее поведение кучек, здесь — то, что чинилось после боевого случая
// «назначено 250 USDT, создано ноль». Вместе они не влезали в 250 строк.
import { describe, expect, it } from "vitest";
import { pileCountByPoint, POINT_MEAN, rollPiles } from "@/lib/raid/scatterMath";
import { pileStep } from "@/lib/raid/scatterPlan";
import { seeded } from "@/test/seeded";

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const show = (xs: number[]) => `[${xs.slice(0, 8).join(", ")}${xs.length > 8 ? ", …" : ""}]`;
/** Сложение float даёт шум ~1e-16 на слагаемое. */
const NOISE = 1e-9;

const TOKEN = pileStep("token");

describe("дробные кучки", () => {
  it("250 USDT при номинале шаблона 0,1 раскладываются, а не пропадают", () => {
    // Тот самый боевой случай: счёт требовал кучку не меньше единицы, потолок
    // 0,1 до неё не дотягивал — фонд назначили, а на карту не встало НИЧЕГО.
    const out = rollPiles(2000, 250, 0.1, { rnd: seeded(1), step: TOKEN, point: 0.1 });
    expect(out.length, "ни одной кучки на фонд 250").toBeGreaterThan(0);
    expect(sum(out)).toBeLessThanOrEqual(250 + NOISE);
    expect(sum(out), `фонд почти не тронут: ${show(out)}`).toBeGreaterThan(100);
    const bad = out.filter((v) => v < 0.01 || v > 0.1);
    expect(bad, `кучки вне [0,01; 0,1]: ${show(bad)}`).toHaveLength(0);
  });

  it("без шага кучки по-прежнему целые — прежнее поведение не тронуто", () => {
    // Шаг не передали — значит единица, как было у всех видов награды до
    // дробных токенов. На потолке 0,1 это честный ноль кучек.
    expect(rollPiles(2000, 250, 0.1, { rnd: seeded(1) })).toHaveLength(0);
  });

  it("лайки, билеты и энергия дробей не получают", () => {
    // Половину билета игроку не выдать: у штучных видов шаг остаётся единицей,
    // и номинал обязан лечь на неё ровно.
    for (const kind of ["likes", "tickets", "energy"] as const) {
      const out = rollPiles(30, 1234.56, 0, { rnd: seeded(3), step: pileStep(kind), point: 40 });
      expect(out.length, kind).toBeGreaterThan(0);
      expect(
        out.filter((v) => !Number.isInteger(v)),
        `${kind}: дроби`,
      ).toHaveLength(0);
      expect(sum(out)).toBeLessThanOrEqual(1234.56 + NOISE);
    }
  });

  it("точка мельче наименьшего номинала поднимается до него", () => {
    // «0,4 лайка» невыразимо: точка становится единицей, и бросок идёт вокруг
    // неё — [1, 2], а не ноль и не дробь.
    const out = rollPiles(10, 100, 0, { rnd: seeded(9), step: 1, point: 0.4 });
    expect(out).toHaveLength(10);
    expect(
      out.filter((v) => v !== 1 && v !== 2),
      "вне [1, 2]",
    ).toHaveLength(0);
  });
});

describe("бросок вокруг точки", () => {
  it("держится в [точка/2, точка × 2]", () => {
    const out = rollPiles(50, 1_000_000, 0, { rnd: seeded(2), step: 1, point: 40 });
    expect(out).toHaveLength(50);
    expect(
      out.filter((v) => v < 20 || v > 80),
      "бросок вне [20, 80]",
    ).toHaveLength(0);
  });

  it("в среднем даёт 1,25 точки — на этом и держится счёт кучек", () => {
    const rnd = seeded(12);
    let acc = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) acc += sum(rollPiles(20, 1e9, 0, { rnd, step: 1, point: 100 }));
    const mean = acc / (runs * 20);
    expect(Math.abs(mean - POINT_MEAN * 100), `среднее ${mean}`).toBeLessThan(5);
  });

  it("потолок шаблона режет бросок сверху", () => {
    // Точка 100 просит [50, 200], но шаблон держит 60: выше него не выдаём.
    const out = rollPiles(20, 100_000, 60, { rnd: seeded(4), step: 1, point: 100 });
    expect(out).toHaveLength(20);
    expect(
      out.filter((v) => v < 50 || v > 60),
      "вне [50, 60]",
    ).toHaveLength(0);
  });

  it("фонд — жёсткий потолок: лишние кучки не встают", () => {
    // Просили 500 кучек по 10 из фонда 100: по среднему броску 12,5 фонда
    // хватает на восемь. Остальные не встают, а не мельчают до пыли.
    const out = rollPiles(500, 100, 0, { rnd: seeded(5), step: 1, point: 10 });
    expect(out.length, `встало ${out.length}: ${show(out)}`).toBe(8);
    expect(sum(out)).toBeLessThanOrEqual(100 + NOISE);
    expect(
      out.filter((v) => v < 5),
      "кучка ниже половины точки",
    ).toHaveLength(0);
  });

  it("точка крупнее фонда — честный ноль кучек", () => {
    expect(rollPiles(10, 3, 0, { rnd: seeded(6), step: 1, point: 100 })).toHaveLength(0);
  });

  it("сумма не больше фонда при любых входах (300 прогонов)", () => {
    const rnd = seeded(77);
    for (let run = 0; run < 300; run++) {
      const fund = Math.round(rnd() * 1e6) / 100;
      const count = 1 + Math.floor(rnd() * 300);
      const cap = rnd() < 0.3 ? 0 : Math.round(rnd() * 5000) / 100;
      const step = rnd() < 0.5 ? TOKEN : 1;
      const point = rnd() < 0.5 ? 0 : Math.round(rnd() * 20_000) / 100;
      const out = rollPiles(count, fund, cap, { rnd, step, point });
      // Проверки собираем в один expect на прогон: сто тысяч отдельных вызовов
      // expect на массивах по три сотни кучек — это минуты на ровном месте.
      const bad = out.filter((v) => !Number.isFinite(v) || v < step || (cap > 0 && v > cap));
      expect(bad, `кучки вне [${step}, ${cap || "∞"}]: ${show(bad)}`).toHaveLength(0);
      expect(sum(out), `сумма ${sum(out)} больше фонда ${fund}`).toBeLessThanOrEqual(fund + NOISE);
      expect(out.length, "кучек больше заказанного").toBeLessThanOrEqual(count);
    }
  });

  it("одинаковый сид — одинаковый результат", () => {
    const roll = (r: () => number) => rollPiles(30, 777.77, 5, { rnd: r, step: TOKEN, point: 1.5 });
    expect(roll(seeded(99)).join("|")).toBe(roll(seeded(99)).join("|"));
  });
});

describe("pileCountByPoint", () => {
  it("считает от фонда и точки с поправкой на 1,25", () => {
    expect(pileCountByPoint(250, 0.1, Number.POSITIVE_INFINITY)).toBe(2000);
    expect(pileCountByPoint(1_000_000, 10_000)).toBe(80);
    // Потолок группы стоит по умолчанию — иначе точка в копейку просила бы
    // миллионы заготовок и роняла предпросмотр.
    expect(pileCountByPoint(1e9, 0.01)).toBe(5000);
  });

  it("вырожденные входы", () => {
    expect(pileCountByPoint(0, 10)).toBe(0);
    expect(pileCountByPoint(100, 0)).toBe(0);
    expect(pileCountByPoint(Number.NaN, 10)).toBe(0);
    expect(pileCountByPoint(-100, 10)).toBe(0);
    // Точка крупнее фонда: одна кучка тут не встанет, и обещать её нечестно.
    expect(pileCountByPoint(3, 100)).toBe(0);
  });
});
