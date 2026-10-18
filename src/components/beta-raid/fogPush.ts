// Отправка разведанного на сервер пачками (useFogSync).
import { addBetaRaidFog } from "@/server/api/beta-raid/fog";
import type { FogMask } from "./fogMask";

/** Серверный вход принимает не больше этого за раз (fog.ts) — режем пачками. */
const PUSH_CHUNK = 2000;

/**
 * Отправить клетки пачками. Возвращает то, что НЕ доехало.
 *
 * Разом сервер принимает ограниченное число (иначе запрос отвергается целиком),
 * а у разведавшего пол-карты их тысячи. Отметку «уже отправлено» ставим только
 * на доехавшую пачку: не дошло — попробуем на следующем шаге.
 */
export async function pushFog(mapId: string, cells: string[], pushed: FogMask): Promise<string[]> {
  for (let i = 0; i < cells.length; i += PUSH_CHUNK) {
    const part = cells.slice(i, i + PUSH_CHUNK);
    try {
      await addBetaRaidFog({ data: { mapId, cells: part } });
    } catch {
      return cells.slice(i);
    }
    pushed.addMany(part);
  }
  return [];
}
