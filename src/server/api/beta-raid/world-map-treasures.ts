// Мои клады для карты мира (владелец, 05.10.2026: «должно быть видно, где
// закопаны мои клады»): мешочки с живыми порциями, обычные и магические
// сундуки, которые закопал я сам — buried_by = мой аккаунт (ПРАВИЛА §8.21 п. 6,
// §8.22 п. 5, §8.15 п. 10).
//
// Выборка — та же myMoundsSql, что подсвечивает мои бугорки на карте рейда
// (main-tool/dig-hole.ts): без круга, с любого расстояния, на карте, где стоит
// игрок, и только свои — чужих кладов в ответе нет никому, админу в «Вся карта»
// тоже. Сбой чтения карту не роняет: кладов просто не будет видно до
// следующего открытия.
import { mcpExec } from "@/server/db/mcpClient";
import { myMoundsSql } from "@/server/api/beta-raid/main-tool/dig-hole";
import type { TreasureCell } from "@/server/api/beta-raid/world-map-pack";

type MoundRow = { q: unknown; r: unknown };

export async function loadMyTreasures(account: string, mapId: string): Promise<TreasureCell[]> {
  // Карта — та, что показывает карта мира (myMapId): позиция без карты — она же.
  const sql = myMoundsSql({ account, activeMapId: mapId });
  try {
    const rows = (await mcpExec(sql, { wrapJson: true })) as MoundRow[];
    // Клетки проверяет и сводит упаковка (packTreasures): мешочков на клетке бывает несколько.
    return (rows ?? []).map((m) => ({ q: Number(m.q), r: Number(m.r) }));
  } catch (e) {
    console.warn("[world-map] клады не прочитались:", e instanceof Error ? e.message : e);
    return [];
  }
}
