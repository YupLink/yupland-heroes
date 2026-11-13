// Кто и откуда пользуется лавкой зачарования.
//
//  • Игрок — как у окна любой постройки и маркета: карта своя, клетка не под
//    куполом, на клетке постройка с эффектом enchant, герой на ней или рядом
//    (requireAdjacent). Попытка зачарования — только так.
//  • Админ (canEdit) — как редактор маркета: свои права и карта, где он стоит
//    (godMapId), постройка — та же лавка; подходить не нужно — в режиме бога
//    окно открывают с любого места.
import { getCurrentWallet, isAdminWallet } from "@/server/auth";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";

/** Аккаунт игрока: без него платить нечем. */
export async function enchantAccount(wallet: string): Promise<string> {
  const { accAccountId } = await import("@/server/api/currency/move");
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) throw new Error("enchant.need_account");
  return account;
}

/**
 * Лавка на клетке (mapId, q, r) доступна этому кошельку. near — требовать
 * героя рядом; админу на чтение и настройку — не нужно. effect — чья постройка:
 * зачарование артефактов или героев (hero-rite) — проверка одна.
 */
export async function requireEnchantShop(
  wallet: string,
  cell: { mapId: string; q: number; r: number },
  near: boolean,
  effect: "enchant" | "hero_enchant" = "enchant",
): Promise<void> {
  const { mapId, q, r } = cell;
  if ((await myMapId(wallet)) !== mapId) throw new Error("enchant.far");
  if (near) {
    const pos = await playerCell(wallet).catch(() => null);
    if (!pos) throw new Error("enchant.far");
    try {
      requireAdjacent(pos, q, r);
    } catch {
      throw new Error("enchant.far");
    }
  }
  await requireNotVoid(wallet, mapId, q, r);
  const b = await loadCellBuilding(mapId, q, r);
  if (b?.effect !== effect) throw new Error("enchant.no_shop");
}

/** Настраивает только админ — как маркет. */
export function requireEnchantAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("enchant.admin_only");
  return w;
}
