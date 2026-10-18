// Какая фишка стоит за NFT по её названию — для NFT без привязки круга (пришла
// со стороны или выехала мимо учёта). Общая для кнопки, пачки и догона: раньше
// каждый путь разбирал название сам, и в углах они расходились.
import { pg } from "../db/pg";
import { fetchSendlerNftById } from "../sendler";
import { getMintReverseMap, fetchOnchainNftTitle } from "./chips-mint-deposit-helpers";
import type { ChipIdentity } from "./nft-cycle-credit";

/** Название NFT: индекс Sendler, иначе сам контракт. */
export async function nftTitle(contract: string, tokenId: string): Promise<string | null> {
  try {
    const nft = await fetchSendlerNftById(contract, tokenId);
    const t = (nft?.title ?? "").trim();
    if (t) return t;
  } catch {
    /* Sendler упал — спросим контракт */
  }
  return (await fetchOnchainNftTitle(contract, tokenId).catch(() => null)) || null;
}

export async function chipIdentityByTitle(
  contract: string,
  tokenId: string,
  titleHint?: string | null,
): Promise<ChipIdentity | null> {
  const title = (titleHint ?? "").trim() || (await nftTitle(contract, tokenId));
  if (!title) return null;
  const m = (await getMintReverseMap()).get(`${contract}::${title}`);
  if (!m) return null;
  const tpl = await pg.chipTemplates.findOne({ id: m.templateId });
  if (!tpl) return null;
  return { templateId: m.templateId, level: m.level, collectionId: tpl.collection_id };
}
