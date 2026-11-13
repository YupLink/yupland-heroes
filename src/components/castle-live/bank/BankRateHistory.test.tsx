// График курса игрокам: линия и свечи рендерятся без NaN на ru и en, свеча роста —
// зелёная, падения — красная, плоская — серая; заголовок — показанный промежуток;
// по умолчанию шаг 1ч и линия.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { candles, RATE_STEPS, type Candle } from "@/lib/bankRate";
import { BankCandleChart } from "./BankCandleChart";
import { fmtSpan } from "./bankRateFmt";

vi.mock("@/server/api/bank/bank-rate", () => ({ getBankRate: vi.fn() }));
const { BankRateHistory } = await import("./BankRateHistory");

const NOW = Date.UTC(2026, 9, 23, 12, 20);
const HOUR = 3_600_000;
const pts = [
  { t: NOW - 3 * 86_400_000, p: 200 },
  { t: NOW - 5 * HOUR, p: 180 },
  { t: NOW - 3 * HOUR, p: 190 },
  { t: NOW - 10 * 60_000, p: 147.55 },
];
const hours = candles(pts, NOW, RATE_STEPS["1h"]);

describe("график курса игрокам", () => {
  it("линия: по закрытиям, без свечей; подпись — время и курс", () => {
    for (const ru of [true, false]) {
      const html = renderToStaticMarkup(
        <BankCandleChart candles={hours} mode="line" step="1h" invert={false} unit="DARAI за 1 Золото" ru={ru} />,
      );
      expect(html).toContain("<polyline");
      expect(html).not.toContain("<rect");
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html).toContain(ru ? "147,55" : "147.55");
      expect(html).toContain(ru ? "старт" : "start");
    }
  });

  it("свечи: рост — зелёная, падение — красная, без событий — серая черта; O/H/L/C", () => {
    for (const ru of [true, false]) {
      const html = renderToStaticMarkup(
        <BankCandleChart candles={hours} mode="candles" step="1h" invert={false} unit="x" ru={ru} />,
      );
      expect(html).not.toContain("<polyline");
      expect(html.match(/<rect/g)).toHaveLength(48);
      expect(html).toContain('fill="#7fd18b"');
      expect(html).toContain('fill="#ef8a7a"');
      expect(html).toContain('fill="#a59c8c"');
      for (const k of ru ? ["Откр", "Макс", "Мин", "Закр"] : ["O", "H", "L", "C"]) expect(html).toContain(`${k} <b`);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("одна свеча и перевёрнутый курс — без NaN, макс не меньше мин", () => {
    const one: Candle[] = [{ t: NOW, o: 0.005, h: 0.006, l: 0.004, c: 0.0055 }];
    const html = renderToStaticMarkup(<BankCandleChart candles={one} mode="candles" step="1d" invert unit="x" ru />);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("мин 166,67 · макс 250"); // 1/0,006 и 1/0,004
  });

  it("промежуток в заголовке — по числу свечей", () => {
    expect(fmtSpan(hours, "1h", true)).toBe("2 дня");
    expect(fmtSpan(hours.slice(0, 10), "1h", false)).toBe("10 h");
    expect(fmtSpan(hours.slice(0, 7), "1d", true)).toBe("7 дней");
    expect(fmtSpan(hours.slice(0, 1), "1d", false)).toBe("1 day");
    expect(fmtSpan(hours.slice(0, 21), "1d", true)).toBe("21 день");
  });

  it("блок: заголовок, курс сейчас, шаги 1ч/4ч/1д и вид; по умолчанию 1ч и линия", () => {
    for (const ru of [true, false]) {
      const qc = new QueryClient();
      const tz = -new Date().getTimezoneOffset();
      qc.setQueryData(["bank-rate", tz], {
        candles: { "1h": hours, "4h": candles(pts, NOW, RATE_STEPS["4h"]), "1d": candles(pts, NOW, RATE_STEPS["1d"]) },
        invert: false,
        base: "gold",
        quote: "Darai",
      });
      const html = renderToStaticMarkup(
        <QueryClientProvider client={qc}>
          <BankRateHistory ru={ru} />
        </QueryClientProvider>,
      );
      // Заголовок по утверждённой примерке: «Курс DARAI / золото», под ним — промежуток.
      expect(html).toContain(ru ? "Динамика за 2 дня" : "2 days");
      expect(html).toContain(ru ? "−26,2 %" : "−26.2 %"); // 147,55 к 200 на начало окна
      expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${ru ? "1ч" : "1h"}<`));
      expect(html).toContain(ru ? ">4ч<" : ">4h<");
      expect(html).toContain(ru ? ">1д<" : ">1d<");
      expect(html).toContain(ru ? 'aria-label="Свечи"' : 'aria-label="Candles"');
      expect(html).toContain("<polyline");
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});
