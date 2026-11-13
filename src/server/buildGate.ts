// Server-side gate против старых клиентов.
// Клиент шлёт X-Client-Build header в каждом server fn запросе (см.
// VersionProvider в src/lib/versionCheck.tsx — там patch для window.fetch).
// На критичных server fn'ах (purchaseTicketsViaToken, craftChip
// и т.п.) вызываем requireFreshClient() — если build не совпадает с
// серверным, бросаем понятную ошибку «Сессия устарела, обновите страницу».
//
// Старые клиенты (которые открыли вкладку давно) header не шлют → попадают
// под этот гарт автоматически.

import { getRequestHeader } from "@tanstack/react-start/server";
import { serverBuildId } from "@/lib/buildId";

const UPGRADE_MSG = "Сессия устарела, обновите страницу";

export function requireFreshClient(): void {
  // Жёсткий гарт временно отключён. Он блокировал ЛЮБОЕ действие у юзера,
  // у которого в Safari остался старый bundle (типичная ситуация после
  // деплоя — pages JS закэширован, header шлёт старый BUILD_ID).
  //
  // Защита от старых клиентов осталась мягкой — клиент сам тихо обновляется
  // (lib/versionCheck → lib/staleReload), когда игрок свернул игру или отошёл.
  //
  // Если когда-то понадобится снова жёстко проверять — нужен механизм
  // grace period (например ±5 минут после деплоя пропускаем mismatch,
  // потому что edge CDN ещё может отдавать старый HTML).
  return;
}
