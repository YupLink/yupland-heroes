// Обход погоды (migrations/weather-01, raid_weather_tick): раз за слот (3 ч)
// дописать погоду всем открытым картам и главному миру, кроме островов, — сразу
// после выката и на каждой смене слота, даже если на карте никто не спросил
// (шахты, фермы и рыбалка читают погоду в базе — raid_weather_coef).
//
// Как обходы грибов и шахт: таймер в каждом процессе, стартует с отдачей
// снимка карты (map-serve) и с первым запросом погоды; раз в минуту смотрит,
// не начался ли новый слот. До 4 процессов разом — безвредно: база кладёт слот
// один раз (ON CONFLICT DO NOTHING), остальные читают легшее; повтор моста —
// тот же итог. Сбой — следующий проход через минуту.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { weatherSlotStart } from "@/lib/raid/weather";

const EVERY_MS = 60_000;

/** Обход всех карт на момент at; отдаёт, скольким картам погода есть. */
export const weatherTickSql = (at: Date): string =>
  `SELECT yuplink.raid_weather_tick(${sqlStr(at.toISOString())}::timestamptz) AS maps`;

/** Слот, обойдённый этим процессом (мс начала). */
let doneSlot: number | null = null;

/** Для тестов: забыть обойдённый слот. */
export const resetWeatherSweep = (): void => {
  doneSlot = null;
};

/** Один проход: новый слот — обойти карты; уже обойдён — ничего. Отдаёт, был ли обход. */
export async function sweepWeather(now = Date.now()): Promise<boolean> {
  const slot = weatherSlotStart(now).getTime();
  if (doneSlot === slot) return false;
  await mcpExec(weatherTickSql(new Date(now)), { wrapJson: true });
  doneSlot = slot;
  return true;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepWeather();
  } catch (e) {
    console.warn("[weather] обход не удался:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить обход в этом процессе: раз в минуту, первый проход — сразу. */
export function startWeatherSweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
