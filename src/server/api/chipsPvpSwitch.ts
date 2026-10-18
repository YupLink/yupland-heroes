// Выключатель ПвП фишек (владелец, 13.10.2026: «пвп — выключи»).
//
// Настройка `chip_pvp_enabled` в yuplink.settings: "true" — бои открыты, всё
// остальное (и её отсутствие) — выключены. Включить обратно можно без выкатки.
// Выключено: новые вызовы не создаются и не принимаются; отменить свой вызов
// можно всегда — фишки возвращаются (иначе они застряли бы запертыми).
import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";

export const PVP_SETTING_KEY = "chip_pvp_enabled";
export const PVP_OFF_MESSAGE = "ПвП фишек выключен";
const TTL_MS = 30_000;

let cache: { at: number; on: boolean } | null = null;

/** Открыты ли бои фишек. Настройка недоступна — считаем выключенными. */
export async function pvpEnabled(now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < TTL_MS) return cache.on;
  let on = false;
  try {
    const row = await pg.settings.findOne({ key: PVP_SETTING_KEY });
    on =
      String(row?.value ?? "")
        .trim()
        .toLowerCase() === "true";
  } catch {
    on = false;
  }
  cache = { at: now, on };
  return on;
}

export async function requirePvpEnabled(): Promise<void> {
  if (!(await pvpEnabled())) throw new Error(PVP_OFF_MESSAGE);
}

/** Для интерфейса: показывать ли вход в ПвП. */
export const getChipPvpEnabled = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: await pvpEnabled(),
}));

/** Для тестов: сбросить кэш настройки. */
export function resetPvpSwitchCache(): void {
  cache = null;
}
