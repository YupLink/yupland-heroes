import { pg } from "../db/pg";
import { normalizeTitle } from "@/lib/normalizeTitle";

interface SendlerListItem {
  token_id: string;
  title?: string;
  media?: string;
  owner_id?: string;
}

const SENDLER_API_BASE = "https://api.sendler.xyz/nft/";

export async function fetchSendlerPage(
  contractAddress: string,
  skip: number,
  limit: number
): Promise<SendlerListItem[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  const url = new URL(SENDLER_API_BASE);
  url.searchParams.set("contract_address", contractAddress);
  url.searchParams.set("skip", String(skip));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "X-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Sendler API: ${res.status}`);
  const json = (await res.json()) as { items?: SendlerListItem[] };
  return (json.items ?? []).filter((x) => !!x.token_id);
}

/**
 * Autocomplete: возвращает уникальные titles из БД по подстроке (case-insensitive).
 */
export async function listCollectionTitlesRaw(
  contractAddress: string,
  q: string,
  limit: number
) {
  let query = pg.collectionTitles
    .raw()
    .select("*")
    .eq("contract_id", contractAddress);
  if (q.length > 0) {
    query = query.ilike("title", `%${q}%`);
  }
  const rows =
    ((
      await query
        .order("count", { ascending: false })
        .order("title", { ascending: true })
        .limit(limit)
    ).data as Array<{
      title: string;
      image: string | null;
      count: number;
    }>) ?? [];

  return rows.map((r) => ({
    title: r.title,
    image: r.image,
    count: r.count,
  }));
}

/**
 * Прогресс сканирования: сколько просмотрено, сколько уникальных titles.
 */
export async function getScanStateRaw(contractId: string) {
  const state = await pg.scanState.findOne({ contract_id: contractId });
  const uniqueTitles = await pg.collectionTitles.count({
    contract_id: contractId,
  });
  return {
    contractId,
    lastSkip: state?.last_skip ?? 0,
    totalSeen: state?.total_seen ?? 0,
    lastScannedAt: state?.last_scanned_at ?? null,
    uniqueTitles,
  };
}

/**
 * Полный сброс кэша коллекции (для перескана с нуля).
 */
export async function resetCollectionScanRaw(contractAddress: string) {
  await pg.collectionTitles.delete({ contract_id: contractAddress });
  await pg.scanState.delete({ contract_id: contractAddress });
}

/**
 * Bulk UPSERT helper: вставляет/обновляет записи в collection_titles.
 */
export async function upsertCollectionTitles(
  contractId: string,
  grouped: Map<string, { title: string; image: string; count: number }>
) {
  if (grouped.size === 0) return;

  const ids = Array.from(grouped.keys()).map(
    (key) => `${contractId}:${key}`
  );
  const existing =
    ((
      await pg.collectionTitles
        .raw()
        .select("id,count,image,title")
        .in("id", ids)
    ).data as Array<{
      id: string;
      count: number;
      image: string | null;
      title: string | null;
    }>) ?? [];
  const exMap = new Map(existing.map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();
  const rows = Array.from(grouped.entries()).map(([key, g]) => {
    const id = `${contractId}:${key}`;
    const ex = exMap.get(id);
    return {
      id,
      contract_id: contractId,
      title: ex?.title ?? g.title,
      image: ex?.image ?? (g.image || null),
      count: (ex?.count ?? 0) + g.count,
      scanned_at: nowIso,
    };
  });
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await pg.collectionTitles.upsert(
      rows.slice(i, i + CHUNK),
      { onConflict: "id" }
    );
  }
}

export { normalizeTitle };
