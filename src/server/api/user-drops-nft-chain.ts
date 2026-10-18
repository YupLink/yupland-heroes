// ─── Types ────────────────────────────────────────────────────────────

export type SendlerLite = {
  token_id: string;
  title?: string;
  media?: string;
  owner_id?: string;
};
export type OwnedIndex = Map<string, Map<string, SendlerLite[]>>;

// ─── On-chain RPC fallback ────────────────────────────────────────────

/**
 * On-chain fallback через NEAR RPC nft_tokens_for_owner.
 * Используется когда Sendler/наш кэш не нашли NFT (типичный кейс —
 * title с trailing-space или необычные символы которые Sendler не
 * индексирует корректно).
 *
 * Пагинируем по 300, кэш на 30с в RAM (за один request не дёргать
 * один контракт+owner дважды).
 */
const nftsForOwnerCache = new Map<
  string,
  { at: number; ttl: number; data: Array<{ token_id: string; title: string; media: string }> }
>();
/** Обычный ответ живёт долго, пустой — недолго (вдруг индексер отстал). */
const TTL_FULL_MS = 5 * 60_000;
const TTL_EMPTY_MS = 60_000;

export async function fetchNftsForOwnerOnChain(
  contractId: string,
  ownerId: string
): Promise<Array<{ token_id: string; title: string; media: string }>> {
  const cacheKey = `${contractId}::${ownerId}`;
  // Кэш был на тридцать секунд — при этом каждый промах стоит до двадцати
  // запросов в цепь на КАЖДУЮ пару «контракт + игрок». За сутки эта функция
  // дала 9641 отказ RPC из 9650: она одна выжирала всю квоту публичных узлов,
  // и из-за неё не уходили выплаты — их просто нечем было отправить.
  const cached = nftsForOwnerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.data;

  // Сначала Sendler: у него есть ручка «NFT владельца в контракте», и она не
  // тратит квоту узлов, которая нужна на ОТПРАВКУ переводов. Цепь остаётся
  // запасным путём — владение это состояние, а не проверка транзакции.
  try {
    const { fetchSendlerNftsByOwner } = await import("../sendler");
    const items = await fetchSendlerNftsByOwner(contractId, ownerId, { maxPages: 20 });
    const mapped = items.map((n) => ({
      token_id: n.token_id,
      title: n.title ?? "",
      media: n.media ?? "",
    }));
    // Пустой ответ — ТОЖЕ ответ. Прежде он проваливался в цепь, и у каждого
    // игрока без NFT в этом контракте (а таких большинство) каждый заход бил
    // в узлы: они отвечали 429 пачкой, и на экране был «RPC fail» вместо
    // честного «ничего нет». Молчание индексера сюда не попадает — оно
    // прилетает исключением ниже. Пустоту держим в кэше недолго на случай,
    // если индексер просто отстал.
    nftsForOwnerCache.set(cacheKey, {
      at: Date.now(),
      ttl: mapped.length > 0 ? TTL_FULL_MS : TTL_EMPTY_MS,
      data: mapped,
    });
    return mapped;
  } catch (e) {
    console.warn(
      `[fetchNftsForOwner] Sendler не ответил contract=${contractId}:`,
      e instanceof Error ? e.message : e,
    );
  }

  const all: Array<{ token_id: string; title: string; media: string }> = [];
  const LIMIT = 300;
  const MAX_PAGES = 20;
  let hadError = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const args = {
        account_id: ownerId,
        from_index: String(page * LIMIT),
        limit: LIMIT,
      };
      const argsB64 = Buffer.from(JSON.stringify(args)).toString("base64");
      const { nearRpc } = await import("../rpc");
      const j = await nearRpc<{ result?: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_tokens_for_owner",
        args_base64: argsB64,
      });
      const bytes = j.result?.result;
      if (!bytes) break;
      const text = Buffer.from(bytes).toString("utf-8");
      const items = JSON.parse(text) as Array<{
        token_id: string;
        metadata?: { title?: string; media?: string };
      }>;
      if (items.length === 0) break;
      for (const it of items) {
        all.push({
          token_id: it.token_id,
          title: it.metadata?.title ?? "",
          media: it.metadata?.media ?? "",
        });
      }
      if (items.length < LIMIT) break;
    } catch (err) {
      console.warn(
        `[fetchNftsForOwnerOnChain] RPC fail contract=${contractId} owner=${ownerId} page=${page}:`,
        err instanceof Error ? err.message : err
      );
      hadError = true;
      break;
    }
  }
  if (!hadError && all.length > 0) {
    nftsForOwnerCache.set(cacheKey, { at: Date.now(), ttl: TTL_FULL_MS, data: all });
  }
  return all;
}
