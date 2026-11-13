// Полосы службы шахт v2 над картой (владелец, 21.10.2026): «над всеми шахтами
// шкала здоровья — красная, тает от полной к пустой, при починке
// восстанавливается». Общий модуль: сервер кодирует ответ, кадр считает долю.
//
// Провод — ОДНА строка, а не массив: seroval кладёт каждое число отдельным
// узлом ({"t":0,"s":…}), и 183 шахты массивами весили 21 КБ, строкой — 4 КБ.
// Запись «q,r,m,left,age,lvl», через «;»: m — номер режима в MINE_MODES, left —
// запас на life_at (0..1, 4 знака), age — секунд от life_at до serverNow, lvl —
// уровень шахты (§8.74; 0 — остров, без кружка). «q,r,lvl» — v2 без хозяина:
// пустая рамка; «q,r,lvl,w» — без хозяина, потому что сломалась, отслужив срок
// (журнал потерь шахты, mine-life-bars.ts): на карте — руины (mine-art). Ничья с
// рождения (остров новичка до починки) — без «w». Старые записи без lvl — уровень 1.
//
// Доля та же, что mineLifeNow (lib/mineV2): запас минус потраченное по сроку
// режима; время — СЕРВЕРА (сдвиг часов телефона снимаем, как mineServerNow).
import { MINE_MODES, mineMode } from "./mineV2";

const HOUR_MS = 3_600_000;

/** Строка базы для кодирования; life null — ничья. lifeAt — мс. */
export type MineLifeRow = {
  q: number;
  r: number;
  life: { mode: string | null; lifeLeft: number; lifeAt: number } | null;
  /** Уровень шахты (§8.74); 0 — кружок не рисуем (остров); нет — 1. */
  level?: number;
  /** Ничья, потому что сломалась, отслужив срок (не ничья с рождения). */
  wrecked?: boolean;
};

/** Ответ сервера: строка полос и его часы в момент ответа (мс). */
export type MineLifeWire = { bars: string; serverNow: number };

/**

 * Полоса для кадра: запас left на момент at (часы сервера, мс), span — срок
 * режима, мс; lvl — уровень шахты в кружке (0 — без кружка; нет — 1).
 * wrecked — только у ничьей: true — сломалась, отслужив срок; false — ничья с рождения.
 */
export type MineBar = { left: number; at: number; span: number; lvl?: number; wrecked?: boolean };
export type MineBars = ReadonlyMap<string, MineBar>;

/** Ничья: пустая рамка при любом «сейчас»; wrecked — ничья после поломки. */
const broken = (lvl: number, wrecked = false): MineBar => ({ left: 0, at: 0, span: 1, lvl, wrecked });

/** Уровень записи: целое 0..99; нет или мусор — 1. */
const lvlOf = (x: unknown): number => {
  const n = Number(x);
  return x != null && x !== "" && Number.isInteger(n) && n >= 0 && n <= 99 ? n : 1;
};

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Строки базы → строка провода. Битые координаты пропускаем. */
export function encodeMineLife(rows: readonly MineLifeRow[], serverNow: number): string {
  const out: string[] = [];
  for (const row of rows) {
    const q = Number(row.q);
    const r = Number(row.r);
    if (!Number.isInteger(q) || !Number.isInteger(r)) continue;
    const life = row.life;
    const lvl = lvlOf(row.level);
    if (!life) {
      out.push(row.wrecked ? `${q},${r},${lvl},w` : `${q},${r},${lvl}`);
      continue;
    }
    const m = MINE_MODES.findIndex((x) => x.id === mineMode(life.mode).id);
    const left = Math.round(clamp01(Number(life.lifeLeft)) * 10_000) / 10_000;
    // Нет времени записи — считаем «записано сейчас» (как mineV2Life).
    const at = Number(life.lifeAt);
    const age =
      Number.isFinite(at) && at > 0 ? Math.max(0, Math.round((serverNow - at) / 1000)) : 0;
    out.push(`${q},${r},${m},${left},${age},${lvl}`);
  }
  return out.join(";");
}

/**
 * Ответ (или его копия из суточного кэша) → полосы по «q,r» и сдвиг часов
 * телефона: skew = clientAt − serverNow. Чужая форма — пусто, без падения.
 */
export function decodeMineLife(
  wire: unknown,
  clientAt?: number,
): { bars: Map<string, MineBar>; skew: number } {
  const bars = new Map<string, MineBar>();
  const w = (wire ?? {}) as Partial<MineLifeWire>;
  const serverNow = Number(w.serverNow);
  if (typeof w.bars !== "string" || !(serverNow > 0)) return { bars, skew: 0 };
  for (const rec of w.bars.split(";")) {
    const f = rec.split(",");
    const q = Number(f[0]);
    const r = Number(f[1]);
    if (f.length < 2 || !Number.isInteger(q) || !Number.isInteger(r)) continue;
    const key = `${q},${r}`;
    if (f.length < 5) {
      bars.set(key, broken(lvlOf(f[2]), f[3] === "w" || f[2] === "w"));
      continue;
    }
    const mode = MINE_MODES[Number(f[2])] ?? MINE_MODES[0];
    const age = Math.max(0, Number(f[4]) || 0);
    bars.set(key, {
      left: clamp01(Number(f[3])),
      at: serverNow - age * 1000,
      span: mode.hours * HOUR_MS,
      lvl: lvlOf(f[5]),
    });
  }
  const c = Number(clientAt);
  const skew = c > 0 && Number.isFinite(c) ? c - serverNow : 0;
  return { bars, skew };
}

/** Доля запаса сейчас (now — часы сервера): 1 — полная, 0 — сломана. */
export function mineBarFrac(b: MineBar, now: number): number {
  return clamp01(b.left - Math.max(0, (now - b.at) / b.span));
}

/** Есть ли полоса, которая ещё тает (будить кадр раз в минуту есть ради чего). */
export function mineBarsAlive(bars: MineBars, now: number): boolean {
  for (const b of bars.values()) if (mineBarFrac(b, now) > 0) return true;
  return false;
}

/**
 * Шахта сломалась, отслужив срок: ничья после поломки или срок вышел по часам
 * (обход поломок ещё не прошёл). Ничья с рождения — нет.
 */
export function mineBarWrecked(b: MineBar, now: number): boolean {
  return b.wrecked ?? mineBarFrac(b, now) <= 0;
}
