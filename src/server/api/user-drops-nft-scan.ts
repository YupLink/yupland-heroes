import { pg, type PgNft } from "../db/pg";
import { fetchSendlerNftsByOwner } from "../sendler";

// ─── Inventory scan через Sendler ─────────────────────────────────────

const MAIN_NFT_CONTRACT = "yuplandshop.mintbase1.near";
const USER_SCAN_THROTTLE_MS = 3 * 60_000; // не чаще раза в 3 минуты
// Память per-process для throttle. Между warm-инстансами Vercel не
// шарится — допустимо, scan дёшев. Главное чтобы один Vercel-инстанс
// не дёргал Sendler каждый рендер.
export const _userScanAt = new Map<number, number>();

/** Скан inventory всех sister-кошельков юзера через Sendler по основному
 *  контракту (yuplandshop). Перезаписывает pg.nfts для этих owner'ов.
 *  Если Sendler упал — оставляет старые данные нетронутыми. */
export async function scanUserInventoryViaSendler(wallet: string): Promise<{
  scanned: number;
  totalNfts: number;
}> {
  const { getSisterWallets } = await import("./user-shared");
  const sisters = await getSisterWallets(wallet);
  let totalNfts = 0;
  let scanned = 0;
  for (const owner of sisters) {
    try {
      const items = await fetchSendlerNftsByOwner(MAIN_NFT_CONTRACT, owner);
      scanned++;
      totalNfts += items.length;
      // Удаляем старые записи для этого owner+contract, заливаем свежие.
      // Атомарность не критична: при гонке UNIQUE на (id) защитит upsert.
      await pg.nfts
        .raw()
        .delete()
        .eq("contract_id", MAIN_NFT_CONTRACT)
        .eq("owner_wallet", owner);
      if (items.length === 0) continue;
      const rows: PgNft[] = items.map((it) => ({
        id: `${MAIN_NFT_CONTRACT}:${it.token_id}`,
        contract_id: MAIN_NFT_CONTRACT,
        token_id: it.token_id,
        collection: MAIN_NFT_CONTRACT,
        owner_wallet: owner,
        name: it.title ?? "",
        image: it.media ?? "",
      }));
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        await pg.nfts.upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
      }
    } catch (err) {
      console.warn(
        `[scanUserInventoryViaSendler] ${owner} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { scanned, totalNfts };
}

/** Ленивый запуск scan'а. Если последний scan этого TG был меньше 3 минут
 *  назад — ничего не делает. Иначе запускает fire-and-forget (не блокирует
 *  caller). */
export async function maybeScanUserInventory(wallet: string): Promise<void> {
  const me = await pg.users.findOne({ wallet });
  if (!me?.telegram_id) return;
  const last = _userScanAt.get(me.telegram_id) ?? 0;
  if (Date.now() - last < USER_SCAN_THROTTLE_MS) return;
  _userScanAt.set(me.telegram_id, Date.now());
  void scanUserInventoryViaSendler(wallet).catch((err) => {
    console.warn("[maybeScanUserInventory] failed:", err);
  });
}
