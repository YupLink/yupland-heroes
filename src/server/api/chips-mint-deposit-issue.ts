// Обмен «выведенная фишка → пак» по явной связке админа.
//
// Всё остальное, что здесь жило (вечный замок «фишка за токен уже выдана»,
// поиск открытой записи чеканки, выдача фишки мимо кругов), заменено кругами
// NFT: nft-cycle.ts — учёт, nft-cycle-credit.ts — выдача. Прежние функции
// запирали ввод каждому следующему владельцу номера (склад номера
// переиспользует) и удалены вместе с разовыми скриптами, которые их звали.
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/**
 * Фишка обратно в игру НЕ возвращается (за неё выдан пак), поэтому закрываем
 * запись индекса чеканки и снимаем NFT с учёта выведенных — иначе счётчики
 * коллекции дрейфовали бы с каждым обменом. Круг NFT закрыла сама выдача пака.
 */
export async function closeMintedChipForPackSwap(
  contract: string,
  tokenId: string,
  wallet: string,
): Promise<void> {
  const rows = (await mcpExec(
    `SELECT collection_id FROM yuplink.chip_nft_mints
      WHERE contract = ${sqlStr(contract)} AND token_id = ${sqlStr(tokenId)}
        AND returned_at IS NULL AND collection_id IS NOT NULL;`,
    { wrapJson: true },
  )) as Array<{ collection_id: string }>;
  const row = rows?.[0];
  if (!row) return;
  await mcpExec(
    `UPDATE yuplink.chip_nft_mints SET returned_at = now(), returned_to = ${sqlStr(wallet)}
      WHERE contract = ${sqlStr(contract)} AND token_id = ${sqlStr(tokenId)};`,
  ).catch(() => {});
  const col = await pg.chipCollections.findOne({ id: row.collection_id });
  if (col) {
    await pg.chipCollections.update(
      { id: col.id },
      {
        minted_count: Math.max(0, (col.minted_count ?? 0) - 1),
        updated_at: new Date().toISOString(),
      },
    );
  }
}
