// Полный скан каталога NFT + пересчёт target_likes у кандидатов лайков.
//
// Используется:
//   - Cron-роутом /api/cron/rescan-catalog (раз в сутки)
//   - Lazy-trigger в listNftCatalogForVoting (если scanned_at старше 1 часа)
//   - После создания дропа (fire-and-forget)

import { normalizeTitle } from "@/lib/normalizeTitle";
import { pg } from "./db/pg";

export const BURN_WALLET = "darai_duplo.near";
export const DEFAULT_CONTRACT = "yuplandshop.mintbase1.near";

interface RescanResult {
  ok: boolean;
  contractAddress: string;
  pagesUsed: number;
  totalScanned: number;
  titles: number;
  burntTotal: number;
  orphansRemoved: number;
  candidatesRecomputed: number;
}

// Защита от параллельных рескан-вызовов (lazy-trigger + другой запрос).
const inflight = new Map<string, Promise<RescanResult>>();
let lastRunAt = 0;

/**
 * Полный rescan каталога одного контракта. Идемпотентный: повторный вызов
 * во время выполнения первого вернёт ТОТ ЖЕ Promise.
 */
export function runFullRescan(
  contractAddress: string = DEFAULT_CONTRACT
): Promise<RescanResult> {
  const existing = inflight.get(contractAddress);
  if (existing) return existing;
  const p = doRescan(contractAddress).finally(() => {
    inflight.delete(contractAddress);
    lastRunAt = Date.now();
  });
  inflight.set(contractAddress, p);
  return p;
}

/** Когда был последний завершённый рескан (для дросселя lazy-trigger'а). */
export function lastRescanAt(): number {
  return lastRunAt;
}

async function doRescan(contractAddress: string): Promise<RescanResult> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не задан");

  const byTitle = new Map<
    string,
    { display: string; total: number; burnt: number; image: string | null }
  >();

  // Накапливаем индивидуальные NFT-строки (contract, token, owner, title, image)
  // в pg.nfts. Раньше сканер заполнял только агрегаты в collection_titles, а
  // pg.nfts оставалась пустой (169 из 165k), хотя owner_id у нас на руках —
  // просто не сохраняли. Без pg.nfts ownership-fallback бесполезен и юзеры
  // массово видят «NFT отвалились».
  const nftRows: Array<{
    id: string;
    contract_id: string;
    token_id: string;
    collection: string;
    name: string;
    image: string;
    owner_wallet: string | null;
  }> = [];

  const LIMIT = 5000;
  const SAFETY_PAGES = 500; // до 2.5M NFT — больше не бывает
  let totalScanned = 0;
  let pagesUsed = 0;
  for (let page = 0; page < SAFETY_PAGES; page++) {
    const url = new URL("https://api.sendler.xyz/nft/");
    url.searchParams.set("contract_address", contractAddress);
    url.searchParams.set("skip", String(page * LIMIT));
    url.searchParams.set("limit", String(LIMIT));
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(
        `Sendler /nft/: ${res.status} ${res.statusText} on page ${page}`
      );
    }
    const json = (await res.json()) as {
      items?: Array<{
        token_id: string;
        title?: string;
        media?: string;
        owner_id?: string;
      }>;
    };
    const items = (json.items ?? []).filter((i) => !!i.token_id);
    pagesUsed++;
    totalScanned += items.length;
    for (const it of items) {
      const title = (it.title ?? "").trim();
      if (!title) continue;
      const nt = normalizeTitle(title);
      const cur = byTitle.get(nt) ?? {
        display: title,
        total: 0,
        burnt: 0,
        image: null as string | null,
      };
      cur.total++;
      if (it.owner_id === BURN_WALLET) cur.burnt++;
      if (!cur.image && it.media) cur.image = it.media;
      byTitle.set(nt, cur);

      // Индивидуальная NFT — для pg.nfts.
      nftRows.push({
        id: `${contractAddress}:${it.token_id}`,
        contract_id: contractAddress,
        token_id: it.token_id,
        collection: contractAddress,
        name: title,
        image: it.media ?? "",
        owner_wallet: it.owner_id ?? null,
      });
    }
    if (items.length < LIMIT) break;
  }

  // UPSERT pg.nfts батчами. 165k строк × 100 на батч = ~1650 запросов.
  // Скан и так раз в час, blocking ОК. onConflict по id (composite contract:token).
  const NFT_BATCH = 500;
  let nftsUpserted = 0;
  for (let i = 0; i < nftRows.length; i += NFT_BATCH) {
    const chunk = nftRows.slice(i, i + NFT_BATCH);
    try {
      await pg.nfts.upsert(chunk, { onConflict: "id" });
      nftsUpserted += chunk.length;
    } catch (err) {
      console.warn(
        `[rescan] pg.nfts upsert батч ${i}-${i + chunk.length} упал:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  console.log(
    `[rescan] pg.nfts upsert: ${nftsUpserted}/${nftRows.length} строк (${contractAddress})`
  );

  const rows = Array.from(byTitle.entries()).map(([nt, v]) => ({
    id: `${contractAddress}:${nt}`,
    contract_id: contractAddress,
    title: v.display,
    image: v.image,
    count: v.total,
    burnt_count: v.burnt,
    scanned_at: new Date().toISOString(),
  }));

  // UPSERT батчами
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await pg.collectionTitles.upsert(chunk, { onConflict: "id" });
  }

  // Удаление orphaned (старая нормализация — дубли с trailing space/регистром)
  const newIds = new Set(rows.map((r) => r.id));
  const { data: existing } = await pg.collectionTitles
    .raw()
    .select("id")
    .eq("contract_id", contractAddress);
  const orphanIds = ((existing ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter((id) => !newIds.has(id));
  let orphansRemoved = 0;
  if (orphanIds.length > 0) {
    const DEL_BATCH = 50;
    for (let i = 0; i < orphanIds.length; i += DEL_BATCH) {
      const slice = orphanIds.slice(i, i + DEL_BATCH);
      await pg.collectionTitles.raw().delete().in("id", slice);
      orphansRemoved += slice.length;
    }
  }

  // target_likes у существующих кандидатов НЕ ПЕРЕСЧИТЫВАЕМ — он фиксируется
  // при создании по настройкам админа на тот момент и остаётся неизменным
  // навсегда (даже если админ потом поменял формулу). Это контракт с юзерами:
  // отдал лайк за цель X — цель X и остаётся.
  //
  // Обновляем только collection_count в кандидатах — это просто справочное
  // поле (показывается «X шт в коллекции»), не влияет на цель.
  const { data: candRows } = await pg.nftLikeCandidates
    .raw()
    .select("id, contract_id, normalized_title, collection_count")
    .eq("contract_id", contractAddress)
    .in("status", ["pending", "ready"]);
  const cands = (candRows ?? []) as Array<{
    id: string;
    contract_id: string;
    normalized_title: string;
    collection_count: number | null;
  }>;

  let candidatesUpdated = 0;
  if (cands.length > 0) {
    const ctIds = cands.map((c) => `${c.contract_id}:${c.normalized_title}`);
    const { data: ctData } = await pg.collectionTitles
      .raw()
      .select("id, count, burnt_count")
      .in("id", ctIds);
    const ctMap = new Map(
      ((ctData ?? []) as Array<{
        id: string;
        count: number;
        burnt_count: number;
      }>).map((r) => [r.id, r])
    );

    for (const c of cands) {
      const ct = ctMap.get(`${c.contract_id}:${c.normalized_title}`);
      if (!ct) continue;
      const available = Math.max(0, ct.count - (ct.burnt_count ?? 0));
      if (available === c.collection_count) continue;
      await pg.nftLikeCandidates.update(
        { id: c.id },
        {
          collection_count: available,
          updated_at: new Date().toISOString(),
        }
      );
      candidatesUpdated++;
    }
  }

  return {
    ok: true,
    contractAddress,
    pagesUsed,
    totalScanned,
    titles: rows.length,
    burntTotal: rows.reduce((s, r) => s + r.burnt_count, 0),
    orphansRemoved,
    candidatesRecomputed: candidatesUpdated,
  };
}

/**
 * Lazy trigger: проверяет когда был последний скан данного контракта.
 * Если данные старше 1 часа (или впервые) — запускает рескан в фоне
 * fire-and-forget, не блокируя caller'а.
 */
export async function maybeBackgroundRescan(
  contractAddress: string = DEFAULT_CONTRACT
): Promise<void> {
  const ONE_HOUR_MS = 60 * 60_000;
  // Сначала пробуем in-memory кэш (быстро, без БД)
  if (Date.now() - lastRunAt < ONE_HOUR_MS && lastRunAt !== 0) return;
  // Если инстанс молодой — проверяем БД scanned_at
  try {
    const { data } = await pg.collectionTitles
      .raw()
      .select("scanned_at")
      .eq("contract_id", contractAddress)
      .order("scanned_at", { ascending: false })
      .limit(1);
    const rowsArr = (data ?? []) as Array<{ scanned_at: string }>;
    const lastDbAt = rowsArr[0]?.scanned_at
      ? new Date(rowsArr[0].scanned_at).getTime()
      : 0;
    if (Date.now() - lastDbAt < ONE_HOUR_MS && lastDbAt !== 0) {
      lastRunAt = lastDbAt; // подсасываем в in-memory
      return;
    }
  } catch {
    // continue — попробуем сделать рескан
  }
  // Fire-and-forget — caller не ждёт.
  void runFullRescan(contractAddress).catch((err) => {
    console.error("[lazy-rescan] failed:", err);
  });
}
