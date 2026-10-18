import { fetchSendlerNftsByTitle, fetchSendlerNftsByOwner } from "../sendler";

type SendlerNft = Awaited<ReturnType<typeof fetchSendlerNftsByTitle>>[number];

/**
 * Мои NFT под simple-дроп: сперва выборка по title, при пустом результате —
 * фолбэк перебором sister-кошельков (Sendler иногда не отдаёт по title).
 * Ответственность модуля — только НАЙТИ; фильтр погашенных и списание
 * билетов остаются в processSimpleDrop.
 */
export async function findMyDropNfts(
  contractId: string,
  dropName: string,
  sisterSet: Set<string>,
): Promise<SendlerNft[]> {
  const items = await fetchSendlerNftsByTitle(contractId, dropName);
  const want = dropName.trim().toLowerCase();
  const strict = items.filter((it) => (it.title ?? "").trim().toLowerCase() === want);
  const useList = strict.length > 0 ? strict : items;
  // owner_id у Sendler опционален — без него NFT ничей, в выборку не идёт.
  const mine = useList.filter((it) => !!it.owner_id && sisterSet.has(it.owner_id));
  if (mine.length > 0) return mine;

  const altMine: SendlerNft[] = [];
  const seen = new Set<string>();
  for (const w of sisterSet) {
    try {
      const owned = await fetchSendlerNftsByOwner(contractId, w);
      for (const it of owned) {
        if (!it.token_id || seen.has(it.token_id)) continue;
        if ((it.title ?? "").trim().toLowerCase() !== want) continue;
        seen.add(it.token_id);
        altMine.push(it);
      }
    } catch {
      /* при ошибке Sendler — пропускаем и пробуем следующего */
    }
  }
  if (altMine.length > 0) {
    console.log(
      `[claim simple] title="${dropName}" — by-title=0, by-owner-fallback=${altMine.length}`,
    );
  }
  return altMine;
}
