// Торговать в лавке — только стоя рядом и не под куполом, как у склада, таверны,
// храма (аудит 11.11.2026; владелец: «про лавку — чини»). Раньше сервер этого не
// проверял: окно лавки открывалось издалека и покупка шла с любой клетки мира,
// а подделанным запросом — и в лавке под куполом.
import { playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";

export async function requireShopNear(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<void> {
  requireAdjacent(await playerCell(wallet), q, r);
  await requireNotVoid(wallet, mapId, q, r);
}
