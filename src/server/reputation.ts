// Sendler reputation-кэш. Раз в 5 минут крон обновляет таблицу
// sendler_reputation, страница / читает локально без Sendler-запросов.

import { pg, type PgSendlerReputation } from "./db/pg";

const SENDLER_REPUTATION_URL = "https://api.sendler.xyz/reputation/";
const TOTAL_KEY = "sendler_reputation_total";
const NEGATIVE_TOTAL_KEY = "sendler_reputation_negative_total";
const LAST_FETCH_KEY = "sendler_reputation_last_fetch";
// 5 минут — частота фоновых пересборок (cron). Само значение хранится
// в settings — если cron не запустился, lazy-refresh из server fn'ов
// сравнивает с этим окном и принудительно перезапросит.
const REFRESH_INTERVAL_MS = 5 * 60_000;

interface SendlerReputationItem {
  owner: string;
  // У владельцев с положительной репутацией Sendler возвращает рейтинг.
  // У владельцев с total_reputation < 0 owner_rank = null — для них мы
  // считаем СВОЙ anti-rank (1 = самый минусовой) и пишем в negative_rank.
  owner_rank: number | null;
  total_reputation: number;
  house?: number;
  bonus_reputation?: number;
}

async function fetchPage(skip: number, limit: number) {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  const url = new URL(SENDLER_REPUTATION_URL);
  url.searchParams.set("skip", String(skip));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "X-API-Key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Sendler reputation: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as {
    items?: SendlerReputationItem[];
    total?: number;
  };
}

/**
 * Полностью перетягивает таблицу репутации из Sendler в локальную БД.
 * Пагинация по 5000 (Sendler-овский потолок). Сейчас всего ~8к юзеров,
 * т.е. 2 страницы. Безопасный cap — 20 страниц (=100k юзеров).
 */
export async function refreshReputation(): Promise<{
  fetched: number;
  total: number;
  ms: number;
}> {
  const t0 = Date.now();
  const LIMIT = 5000;
  const MAX_PAGES = 20;
  const items: SendlerReputationItem[] = [];
  let total = 0;
  // Дедуп по owner на лету: Sendler иногда отдаёт повторяющиеся записи между
  // страницами (если данные дрейфуют во время пагинации), без этого получаем
  // 150k+ вызовов upsert при 8k уникальных юзеров.
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await fetchPage(page * LIMIT, LIMIT);
    const got = r.items ?? [];
    // total берём только с ПЕРВОЙ страницы — иногда API меняет смысл
    // поля на последующих страницах.
    if (page === 0 && typeof r.total === "number") total = r.total;
    let newOnPage = 0;
    for (const it of got) {
      if (!it.owner || seen.has(it.owner)) continue;
      seen.add(it.owner);
      items.push(it);
      newOnPage++;
    }
    // Если страница не принесла НИ ОДНОЙ новой записи — пагинация зациклилась.
    if (newOnPage === 0) break;
    if (got.length < LIMIT) break;
  }

  // Базовая валидация (owner + total_reputation обязательны)
  const valid = items.filter(
    (it) =>
      typeof it.owner === "string" &&
      it.owner.length > 0 &&
      typeof it.total_reputation === "number"
  );

  // Anti-leaderboard: считаем negative_rank ТОЛЬКО для тех у кого репа
  // отрицательная. Самый минусовой → #1. Остальные не получают anti-rank.
  const negatives = valid
    .filter((it) => it.total_reputation < 0)
    .sort((a, b) => a.total_reputation - b.total_reputation);
  const negRankByOwner = new Map<string, number>();
  negatives.forEach((it, idx) => {
    negRankByOwner.set(it.owner, idx + 1);
  });

  // Upsert батчем (PostgREST `upsert` принимает массив и сам делает ON CONFLICT).
  const CHUNK = 500;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    await pg.sendlerReputation.upsert(
      chunk.map((it) => ({
        wallet: it.owner,
        rank: typeof it.owner_rank === "number" ? it.owner_rank : null,
        negative_rank: negRankByOwner.get(it.owner) ?? null,
        total_reputation: it.total_reputation,
        house: it.house ?? null,
        bonus_reputation: it.bonus_reputation ?? 0,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "wallet" }
    );
  }

  // Total из API относится ко всем участникам (positive + negative).
  // Считаем positive отдельно для подписи "#42 из POSITIVE_TOTAL" в UI.
  const positiveCount = valid.filter(
    (it) => typeof it.owner_rank === "number"
  ).length;
  await upsertSetting(TOTAL_KEY, String(positiveCount || total || valid.length));
  await upsertSetting(NEGATIVE_TOTAL_KEY, String(negatives.length));
  await upsertSetting(LAST_FETCH_KEY, new Date().toISOString());

  return {
    fetched: valid.length,
    total: total || valid.length,
    positiveCount,
    negativeCount: negatives.length,
    ms: Date.now() - t0,
  };
}

async function upsertSetting(key: string, value: string) {
  await pg.settings.upsert({ key, value }, { onConflict: "key" });
}

/**
 * Lazy-refresh: если кэш старше окна — запускает background refresh.
 * Не блокирует caller'а.
 */
export function maybeBackgroundRefresh() {
  void (async () => {
    try {
      const row = await pg.settings.findOne({ key: LAST_FETCH_KEY });
      const last = row ? new Date(row.value).getTime() : 0;
      if (Date.now() - last < REFRESH_INTERVAL_MS) return;
      await refreshReputation();
    } catch (err) {
      console.warn("background reputation refresh failed:", err);
    }
  })();
}

export interface ReputationRow {
  wallet: string;
  // Положительный leaderboard. null для wallet'ов с total<0.
  rank: number | null;
  // Anti-leaderboard (1 = самый минусовой). null для не-негативных.
  negativeRank: number | null;
  totalReputation: number;
}

/**
 * Возвращает кэш репутации по списку wallet'ов + два total'а
 * (для подписей "#42 из 8236" и "#5 из 312" соответственно).
 * Не дёргает Sendler — только локальная БД. Lazy-кикает background
 * refresh если данные устарели.
 */
export async function getReputationForWallets(wallets: string[]): Promise<{
  rows: ReputationRow[];
  total: number;
  negativeTotal: number;
}> {
  maybeBackgroundRefresh();
  if (wallets.length === 0) return { rows: [], total: 0, negativeTotal: 0 };
  const data = (
    await pg.sendlerReputation
      .raw()
      .select("wallet,rank,negative_rank,total_reputation")
      .in("wallet", wallets)
  ).data as Array<
    Pick<
      PgSendlerReputation,
      "wallet" | "rank" | "negative_rank" | "total_reputation"
    >
  > | null;
  const rows: ReputationRow[] = (data ?? []).map((r) => ({
    wallet: r.wallet,
    rank: r.rank,
    negativeRank: r.negative_rank,
    totalReputation: r.total_reputation,
  }));
  const totRow = await pg.settings.findOne({ key: TOTAL_KEY });
  const negTotRow = await pg.settings.findOne({ key: NEGATIVE_TOTAL_KEY });
  const total = totRow ? Number(totRow.value) : 0;
  const negativeTotal = negTotRow ? Number(negTotRow.value) : 0;
  return { rows, total, negativeTotal };
}
