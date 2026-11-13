// Вид статистики пулов: график, таблицы и «вытащили» рендерятся без NaN, на ru и en;
// форматы сумм, курса и оттока.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BankPool } from "@/lib/castleBank";
import { poolStats, type BankEvent } from "@/lib/bankStats";
import { BankRateChart } from "./BankRateChart";
import { BankFeesTable, BankOutflow, BankVolumeTable } from "./BankStatsTables";
import { fmtOutflow, fmtPct, fmtRate, fmtStat } from "./bankStatsFmt";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const pool: BankPool = {
  id: "bp_d",
  tokenA: "gold",
  tokenB: "diamonds",
  weightA: 200,
  weightB: 1,
  reserveA: 1098,
  reserveB: 4.5546,
  feePct: 10,
  createdAt: "2026-10-21T00:00:00Z",
};
const events: BankEvent[] = [
  { kind: "fund", at: NOW - 30 * 3_600_000, a: 1000, b: 5 },
  { kind: "swap", at: NOW - 2 * 3_600_000, tokenIn: "gold", amountIn: 100, amountOut: 0.4454, feePool: 8, feeMap: 2 },
];

describe("вид статистики", () => {
  const s = poolStats(pool, events, NOW);

  it("график: точка на каждый обмен, подписи курса в прочтении «золото за алмаз»", () => {
    for (const ru of [true, false]) {
      const html = renderToStaticMarkup(
        <BankRateChart points={s.points} invert start={s.priceStart} unit="Золото за 1 Алмазы" ru={ru} />,
      );
      expect(html).toContain("<polyline");
      expect(html).not.toMatch(/NaN|Infinity/);
      expect(html).toContain(ru ? "старт" : "start");
      expect(html).toContain("200"); // стартовый курс 200 золота за алмаз
    }
  });

  it("одна точка — графика нет, подпись", () => {
    const html = renderToStaticMarkup(<BankRateChart points={s.points.slice(0, 1)} invert start={0.005} unit="x" ru />);
    expect(html).toContain("графика нет");
  });

  it("таблицы и отток без NaN, на двух языках", () => {
    for (const ru of [true, false]) {
      const html = renderToStaticMarkup(
        <>
          <BankFeesTable sides={[s.a, s.b]} ru={ru} />
          <BankVolumeTable sides={[s.a, s.b]} swaps={s.swaps} ru={ru} />
          <BankOutflow sides={[s.a, s.b]} lastFundAt={s.lastFundAt} ru={ru} />
        </>,
      );
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html).toContain(ru ? "в пул карты" : "to map pool");
      expect(html).toContain(ru ? "прибавилось" : "grew by"); // золота в пуле стало больше
    }
  });

  it("без наполнения — прочерк вместо оттока с наполнения", () => {
    const html = renderToStaticMarkup(<BankOutflow sides={[s.a]} lastFundAt={null} ru />);
    expect(html).toContain("—");
  });
});

describe("форматы", () => {
  it("суммы: млн, целые от сотни, мелочь до 4 знаков", () => {
    expect(fmtStat(89_313_705.90299255, false)).toBe("89.31 M");
    expect(fmtStat(692_486.4791, false)).toBe("692,486");
    expect(fmtStat(12.3456, false)).toBe("12.35");
    expect(fmtStat(0.02581, false)).toBe("0.0258");
  });

  it("курс и проценты", () => {
    expect(fmtRate(128.9712, false)).toBe("128.97");
    expect(fmtRate(0.4772611, false)).toBe("0.477261");
    expect(fmtPct(-35.52, false)).toBe("−35.5 %");
    expect(fmtPct(4, false)).toBe("+4 %");
  });

  it("отток: плюс — вытащили, минус — прибавилось", () => {
    expect(fmtOutflow(150, false)).toBe("150");
    expect(fmtOutflow(-2.5, false)).toBe("grew by 2.5");
    expect(fmtOutflow(0, true)).toBe("0");
  });
});
