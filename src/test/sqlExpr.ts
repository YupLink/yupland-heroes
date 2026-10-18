// Мини-вычислитель SQL для фейков базы в тестах: ровно то подмножество, из
// которого собраны формулы меток происхождения (stack-origin) и счётчиков, —
// LEAST, GREATEST, ROUND(x, k), «+», «−», скобки, числа, имена колонок и
// CASE WHEN a <сравнение> b THEN … ELSE … END (вклад в сундук, износ).
// Считает numeric на BigInt (numeric.ts), как Postgres, а не double. Чужой
// синтаксис — ошибка теста, а не тихий ноль.
import { dec, decNum, roundDec } from "@/test/numeric";

/** Значения колонок по имени так, как они стоят в SQL: "b.count", "EXCLUDED.mob_count". */
export type SqlEnv = Record<string, bigint>;

const TOKEN =
  /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9.]*|"[^"]*"|<=|>=|<>|[(),+\-<>=])/iy;

/** Сравнение внутри CASE WHEN. */
const CMP: Record<string, (a: bigint, b: bigint) => boolean> = {
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  "=": (a, b) => a === b,
  "<>": (a, b) => a !== b,
};

function tokenize(s: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(s);
    if (!m) {
      if (s.slice(at).trim() === "") break;
      throw new Error(`непонятный SQL: «${s.slice(at)}»`);
    }
    out.push(m[1]);
  }
  return out;
}

/** Значение выражения над строкой env. */
export function evalSql(expr: string, env: SqlEnv): bigint {
  const toks = tokenize(expr);
  let i = 0;
  const take = (want?: string): string => {
    const t = toks[i++];
    if (t === undefined || (want && t !== want)) throw new Error(`ждали «${want}» в «${expr}»`);
    return t;
  };
  const primary = (): bigint => {
    const t = take();
    if (t === "(") {
      const v = sum();
      take(")");
      return v;
    }
    if (t === "-") return -primary();
    if (/^\d/.test(t)) return dec(t);
    const fn = t.toUpperCase();
    if (fn === "CASE") {
      // CASE WHEN a op b THEN x [WHEN …] ELSE y END — ветки по порядку.
      let out: bigint | null = null;
      while (toks[i]?.toUpperCase() === "WHEN") {
        take();
        const a = sum();
        const op = take();
        if (!(op in CMP)) throw new Error(`непонятное сравнение «${op}» в «${expr}»`);
        const b = sum();
        if (take().toUpperCase() !== "THEN") throw new Error(`ждали THEN в «${expr}»`);
        const v = sum();
        if (out === null && CMP[op](a, b)) out = v;
      }
      if (take().toUpperCase() !== "ELSE") throw new Error(`ждали ELSE в «${expr}»`);
      const other = sum();
      if (take().toUpperCase() !== "END") throw new Error(`ждали END в «${expr}»`);
      return out ?? other;
    }
    if (toks[i] === "(" && ["LEAST", "GREATEST", "ROUND"].includes(fn)) {
      take("(");
      const args = [sum()];
      while (toks[i] === ",") {
        take(",");
        args.push(sum());
      }
      take(")");
      if (fn === "ROUND") return roundDec(args[0], decNum(args[1]));
      return args.reduce((a, b) => ((fn === "LEAST" ? a < b : a > b) ? a : b));
    }
    if (!(t in env)) throw new Error(`нет колонки ${t} в «${expr}»`);
    return env[t];
  };
  const sum = (): bigint => {
    let v = primary();
    while (toks[i] === "+" || toks[i] === "-") {
      const op = take();
      const r = primary();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  if (i !== toks.length) throw new Error(`хвост «${toks.slice(i).join(" ")}» в «${expr}»`);
  return v;
}

/** Разбить список по запятым верхнего уровня (скобки не режем). */
export function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Кусок SQL от ключевого слова до следующего из stops — на верхнем уровне скобок. */
export function clause(sql: string, from: string, stops: string[]): string {
  const s = sql.replace(/\s+/g, " ");
  const start = s.indexOf(` ${from} `);
  if (start < 0) throw new Error(`нет ${from} в SQL`);
  let depth = 0;
  const body = s.slice(start + from.length + 2);
  // Слово-стоп — только целым словом, знак (;) — где угодно.
  const stopAt = (k: number) =>
    stops.some((w) => (/^\w+$/.test(w) ? body.startsWith(` ${w} `, k) : body.startsWith(w, k)));
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && stopAt(k)) return body.slice(0, k).trim();
  }
  return body.trim();
}

/** Присваивания SET: колонка → выражение (updated_at = now() пропускаем). */
export function setsOf(sql: string, from = "SET"): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of splitTop(clause(sql, from, ["FROM", "WHERE", "RETURNING", ";"]))) {
    const eq = part.indexOf("=");
    const col = part.slice(0, eq).trim();
    if (col !== "updated_at") out.set(col, part.slice(eq + 1).trim());
  }
  return out;
}

/** Выражения RETURNING с псевдонимом: "mobTaken" → выражение. */
export function returningOf(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of splitTop(clause(sql, "RETURNING", [";"]))) {
    const m = /^(.*) AS "([^"]+)"$/.exec(part);
    if (m) out.set(m[2], m[1].trim());
  }
  return out;
}
