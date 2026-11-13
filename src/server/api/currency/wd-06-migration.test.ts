// Миграция wd-06 (ПРАВИЛА §8.53, 23.10.2026): лимит вывода DARAI = max(10 млн,
// своё + min(10 % · база прибавки, 100 млн)). Своё — ввод за 30 дней (DARAI с кошелька
// все, $ и ★ по курсу, номинал NFT-холдеров), ввод прошлого месяца — за вычетом
// выведенного тогда же. База прибавки — меньшее из своего и пика чистого остатка DARAI
// (+ $/★/холдеры): круг «завёл → вывел → завёл» прибавку не раздувает. Ступени не читаются.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/wd-06-darai-limit-input.sql", import.meta.url)),
  "utf8",
);
const body = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"));

type Ev = { kind: "dep" | "wd"; amount: number; prevMonth?: boolean };

/** Та же арифметика, что в функции (только DARAI; $ и холдеры складываются так же). */
function cap(evs: Ev[], base = 10_000_000): number {
  let run = 0;
  let peak = 0;
  let dPrev = 0;
  let dCur = 0;
  let wPrev = 0;
  for (const e of evs) {
    // Остаток не ниже нуля: вывод заработанного сверх заведённого ввод не съедает.
    run = Math.max(0, run + (e.kind === "dep" ? e.amount : -e.amount));
    peak = Math.max(peak, run);
    if (e.kind === "dep") {
      if (e.prevMonth) dPrev += e.amount;
      else dCur += e.amount;
    } else if (e.prevMonth) wPrev += e.amount;
  }
  const own = Math.max(0, dPrev - wPrev) + dCur;
  const bonus = Math.min(Math.min(own, peak) * 0.1, 100_000_000);
  return Math.max(base, Math.floor(own + bonus));
}

const M = 1_000_000;

describe("wd-06: заведённое + 10 %", () => {
  it("примеры владельца: 100 млн → 110; ничего — 10; прибавка не больше 100 млн", () => {
    expect(cap([{ kind: "dep", amount: 100 * M }])).toBe(110 * M);
    expect(cap([])).toBe(10 * M);
    expect(cap([{ kind: "dep", amount: 2000 * M }])).toBe(2100 * M);
  });

  it("свой вывод лимит не урезает: вывел 50 из 110 — ещё 60", () => {
    const evs: Ev[] = [
      { kind: "dep", amount: 100 * M },
      { kind: "wd", amount: 50 * M },
    ];
    expect(cap(evs) - 50 * M).toBe(60 * M);
  });

  it("круг «завёл → вывел → завёл» прибавку не раздувает", () => {
    const evs: Ev[] = [];
    for (let i = 0; i < 10; i++) evs.push({ kind: "dep", amount: 100 * M }, { kind: "wd", amount: 100 * M });
    evs.push({ kind: "dep", amount: 100 * M });
    // Завёл 1 100, вывел 1 000 — остаётся своё 100 + 10 %.
    expect(cap(evs) - 1000 * M).toBe(110 * M);
  });

  it("ввод прошлого месяца, выведенный тогда же, в новом месяце лимитом не возвращается", () => {
    const evs: Ev[] = [
      { kind: "dep", amount: 225 * M, prevMonth: true },
      { kind: "wd", amount: 247 * M, prevMonth: true },
    ];
    expect(cap(evs)).toBe(10 * M);
    // А прошлый вывод базовых 10 млн новый ввод не урезает.
    expect(cap([{ kind: "wd", amount: 10 * M, prevMonth: true }, { kind: "dep", amount: 100 * M }])).toBe(
      110 * M,
    );
  });

  it("SQL: та же арифметика, $ и ★ по курсу, холдеры, индекс по токену, ступени не читаются", () => {
    expect(body).toContain("GREATEST(0, d_prev + u_prev * v_rate + h_prev - w_prev)");
    expect(body).toContain("+ d_cur + u_cur * v_rate + h_cur");
    expect(body).toContain("LEAST(LEAST(v_own, v_peak + (u_prev + u_cur) * v_rate + h_prev + h_cur) * 0.1,");
    expect(body).toContain("RETURN GREATEST(v_base, floor(v_own + v_bonus))");
    expect(body).toContain("GREATEST(0, s_prev) * 0.013");
    expect(body).toContain("s.source = 'holder'");
    expect(body).toContain("y.run - LEAST(0, min(y.run) OVER");
    for (const t of ["'USDT'", "'STARS'", "'Darai'"]) expect(body).toContain(`l.token = ${t}`);
    expect(body).not.toContain("darai_withdraw_tiers");
    expect(body).toContain("IF v_base <= 0 THEN RETURN NULL; END IF;");
  });
});
