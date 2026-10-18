// Наблюдения «К распределению» для авторассылки DARAI: раз в 5 минут каждый
// воркер пишет число, хранится последний час. Рассылка берёт минимум за час —
// всплеск от денег, которые пришли на склад и ещё не записаны, не уходит.
//
// Одна строка JSON в yuplink.settings. Два воркера могут затереть друг другу
// точку — не страшно: минимум по оставшимся точкам всё равно осторожный.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export const OBS_KEY = "autodist:free_obs";
const KEEP_MS = 60 * 60_000;
/** Сколько минимум надо наблюдать, прежде чем слать. */
export const MIN_WATCH_MS = 40 * 60_000;

type Point = { t: number; v: number };

async function load(): Promise<Point[]> {
  const rows = (await mcpExec(`SELECT value FROM yuplink.settings WHERE key = ${sqlStr(OBS_KEY)} LIMIT 1;`, {
    wrapJson: true,
  })) as Array<{ value: string | null }> | null;
  try {
    const arr = JSON.parse(String(rows?.[0]?.value ?? "[]")) as Point[];
    return Array.isArray(arr) ? arr.filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.v)) : [];
  } catch {
    return [];
  }
}

/** Записать точку (и выбросить старше часа). */
export async function observe(value: number, now = Date.now()): Promise<void> {
  const pts = (await load()).filter((p) => now - p.t < KEEP_MS);
  pts.push({ t: now, v: Math.round(value * 100) / 100 });
  await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(OBS_KEY)}, ${sqlStr(JSON.stringify(pts))})
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  );
}

/** Минимум за час; null — наблюдаем меньше 40 минут (или был перерыв). */
export async function observedMin(now = Date.now()): Promise<number | null> {
  return minOf(await load(), now);
}

export function minOf(points: Point[], now: number): number | null {
  const pts = points.filter((p) => now - p.t < KEEP_MS && p.t <= now);
  if (!pts.length || now - Math.min(...pts.map((p) => p.t)) < MIN_WATCH_MS) return null;
  return Math.min(...pts.map((p) => p.v));
}
