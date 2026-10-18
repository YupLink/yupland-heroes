// Уведомления админу о новых лотах в Sendler-маркете.
//
// Что делает:
//   1. Тянет /v2/nft/active-sales/ для контракта yuplandshop.mintbase1.near.
//   2. Фильтрует только те лоты, чей title упомянут в активных
//      simple-дропах, combo-дропах или ticket-event'ах.
//   3. Применяет admin-фильтры (settings.marketplace_filters):
//        • maxPriceByToken — отбрасывает дороже X в каждом токене
//        • excludeTokens — целиком игнорим лоты с этим payment-токеном
//        • onlyCampaigns — только если хоть одна совпадает
//   4. Отбрасывает токены, которые уже заклеймлены в этих кампаниях
//      (UNIQUE per (campaign, contract, token)).
//   5. Дедупит уже отправленные уведомления (по sale_id).
//   6. Сортирует по цене ASC (внутри одного payment-токена) и шлёт TG.

import { pg } from "./db/pg";
import { tgSendMessage } from "./tg";
import { normalizeTitle } from "@/lib/normalizeTitle";

const MARKETPLACE_NOTIFY_TG = 100000001;
const SENDLER_CONTRACT = "yuplandshop.mintbase1.near";
const SENDLER_API = "https://api.sendler.xyz";
const FILTERS_KEY = "marketplace_filters";

interface ActiveSale {
  approval_id: number;
  token_id: string;
  title: string;
  price: string;
  price_token: string;
  currency?: string;
  market_type?: string;
  state?: string;
  owner_id?: string;
}

export interface MarketplaceFilters {
  // Для каждого нормализованного symbol'а — макс. цена в HUMAN-форме.
  maxPriceByToken?: Record<string, number>;
  // Symbols которых не уведомлять (NEAR, USDT, ...).
  excludeTokens?: string[];
  // Только эти campaign-id'ы (если пусто — все).
  onlyCampaigns?: string[];
}

async function getFilters(): Promise<MarketplaceFilters> {
  const row = await pg.settings.findOne({ key: FILTERS_KEY });
  if (!row) return {};
  try {
    return JSON.parse(row.value) as MarketplaceFilters;
  } catch {
    return {};
  }
}

async function fetchActiveSales(): Promise<ActiveSale[]> {
  const apiKey = process.env.SENDLER_API_KEY;
  if (!apiKey) throw new Error("SENDLER_API_KEY не сконфигурирован");
  // /v2/nft/active-sales/ имеет server-side лимит 500 на страницу
  // (в отличие от /nft/ где 5000). Превышение → 422.
  const LIMIT = 500;
  const all: ActiveSale[] = [];
  for (let page = 0; page < 200; page++) {
    const url = new URL(`${SENDLER_API}/v2/nft/active-sales/`);
    url.searchParams.set("nft_contract_id", SENDLER_CONTRACT);
    url.searchParams.set("skip", String(page * LIMIT));
    url.searchParams.set("limit", String(LIMIT));
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json", "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Sendler active-sales: ${res.status}`);
    }
    const j = (await res.json()) as { items?: ActiveSale[] };
    const got = j.items ?? [];
    for (const it of got) {
      if (it.approval_id != null && it.token_id && it.title) all.push(it);
    }
    if (got.length < LIMIT) break;
  }
  return all;
}

interface RelevantCampaign {
  id: string;
  name: string;
  mode: "simple" | "combo";
  rewardSpec: string;
  // Сколько штук NFT с этим title нужно для одного set'а в combo (для simple = 1).
  requiredCount: number;
  // Сколько NFT этого title уже на sister-кошельках админа (если переданы).
  ownedCount?: number;
}

interface RelevantTicketEvent {
  id: string;
  rewardTickets: number;
  requiredCount: number;
  ownedCount?: number;
}

async function buildTitleIndex(): Promise<{
  titleToDrops: Map<string, RelevantCampaign[]>;
  titleToEvents: Map<string, RelevantTicketEvent[]>;
}> {
  const activeDrops = await pg.campaigns.findMany({ status: "active" });
  const activeEvents = await pg.ticketEvents.findMany({ active: true });

  const titleToDrops = new Map<string, RelevantCampaign[]>();
  const titleToEvents = new Map<string, RelevantTicketEvent[]>();

  for (const d of activeDrops) {
    if (d.contract_id !== SENDLER_CONTRACT) continue;
    const rewardSpec =
      d.reward_min === d.reward_max
        ? `${d.reward_min} ${d.reward_token}`
        : `${d.reward_min}–${d.reward_max} ${d.reward_token}`;
    if (d.mode === "combo") {
      let reqs: Array<{ title: string; count: number }> = [];
      try {
        reqs = JSON.parse(d.requirements ?? "[]");
      } catch {
        // skip
      }
      for (const r of reqs) {
        const arr = titleToDrops.get(normalizeTitle(r.title)) ?? [];
        arr.push({
          id: d.id,
          name: d.name,
          mode: "combo",
          rewardSpec,
          requiredCount: r.count,
        });
        titleToDrops.set(normalizeTitle(r.title), arr);
      }
    } else {
      const arr = titleToDrops.get(normalizeTitle(d.name)) ?? [];
      arr.push({
        id: d.id,
        name: d.name,
        mode: "simple",
        rewardSpec,
        requiredCount: 1,
      });
      titleToDrops.set(normalizeTitle(d.name), arr);
    }
  }

  for (const e of activeEvents) {
    if (e.contract_id !== SENDLER_CONTRACT) continue;
    let reqs: Array<{ title: string; count: number }> = [];
    try {
      reqs = JSON.parse(e.requirements);
    } catch {
      // skip
    }
    for (const r of reqs) {
      const arr = titleToEvents.get(normalizeTitle(r.title)) ?? [];
      arr.push({
        id: e.id,
        rewardTickets: e.reward_tickets,
        requiredCount: r.count,
      });
      titleToEvents.set(normalizeTitle(r.title), arr);
    }
  }

  return { titleToDrops, titleToEvents };
}

interface TokenInfo {
  symbol: string;
  decimals: number;
}

async function buildTokenMap(): Promise<Map<string, TokenInfo>> {
  // ftContract → {symbol, decimals}. Плюс хардкод "near" → NEAR/24.
  const tokens = await pg.rewardTokens.findMany();
  const map = new Map<string, TokenInfo>();
  map.set("near", { symbol: "NEAR", decimals: 24 });
  for (const t of tokens) {
    map.set(t.ft_contract, { symbol: t.symbol, decimals: t.decimals });
  }
  return map;
}

/**
 * Конвертация raw-amount (string) в human-форму с учётом decimals.
 * Возвращает строку с обрезкой trailing-нулей.
 */
function rawToHumanString(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  try {
    const r = BigInt(raw);
    const d = 10n ** BigInt(decimals);
    const whole = r / d;
    const frac = r % d;
    if (frac === 0n) return whole.toString();
    const fracStr = frac
      .toString()
      .padStart(decimals, "0")
      .slice(0, Math.min(6, decimals))
      .replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return raw;
  }
}

/**
 * Сокращённый формат: "3,5 млн", "12,3 тыс", "750". Для отображения
 * в чипах/уведомлениях, где длинное число выглядит уродливо.
 */
function shortenHuman(num: number): string {
  if (!Number.isFinite(num)) return "0";
  const abs = Math.abs(num);
  const fmt = (v: number, suf: string) =>
    `${v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}${suf}`;
  if (abs >= 1_000_000_000) return fmt(num / 1_000_000_000, " млрд");
  if (abs >= 1_000_000) return fmt(num / 1_000_000, " млн");
  if (abs >= 10_000) return fmt(num / 1_000, " тыс");
  // < 10k — оставляем как есть с разделителями.
  return num.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

/**
 * Производная human-цены из raw + token info (для сравнения / сортировки).
 */
function rawToHumanNumber(raw: string, decimals: number): number {
  try {
    const r = BigInt(raw);
    const d = 10n ** BigInt(decimals);
    const whole = Number(r / d);
    const frac = Number(r % d) / Number(d);
    return whole + frac;
  } catch {
    return 0;
  }
}

/**
 * Производит «нормализованный» symbol для отображения / фильтрации:
 *   "near" → "NEAR"
 *   "darai.tkn.near" → "DARAI"
 *   "usdt.tether-token.near" → "USDT"
 *   ftContract из reward_tokens → точный symbol
 */
function tokenLabel(
  priceToken: string,
  tokenMap: Map<string, TokenInfo>
): string {
  const known = tokenMap.get(priceToken);
  if (known) return known.symbol;
  // Fallback: первый сегмент до точки, в верхнем регистре.
  const seg = priceToken.split(".")[0] || priceToken;
  return seg.toUpperCase();
}

/**
 * Применяет admin-фильтры. Возвращает true если лот ПРОХОДИТ (надо слать).
 */
function passesFilters(
  symbol: string,
  humanPrice: number,
  matchingCampaignIds: string[],
  filters: MarketplaceFilters
): boolean {
  if (filters.excludeTokens?.includes(symbol)) return false;
  const cap = filters.maxPriceByToken?.[symbol];
  if (typeof cap === "number" && cap > 0 && humanPrice > cap) return false;
  if (filters.onlyCampaigns && filters.onlyCampaigns.length > 0) {
    const ok = matchingCampaignIds.some((id) =>
      filters.onlyCampaigns!.includes(id)
    );
    if (!ok) return false;
  }
  return true;
}

interface MatchedListing {
  sale: ActiveSale;
  symbol: string;
  decimals: number;
  humanPrice: number;
  drops: RelevantCampaign[];
  events: RelevantTicketEvent[];
}

/**
 * Полный пайплайн: fetch → match → filter (по claim) → дедуп.
 * Возвращает «свежие» подходящие лоты, отсортированные по цене ASC.
 * Не шлёт TG — просто отбирает.
 */
async function pickFreshMatchingListings(): Promise<MatchedListing[]> {
  const sales = await fetchActiveSales();
  const { titleToDrops, titleToEvents } = await buildTitleIndex();
  const tokenMap = await buildTokenMap();
  const filters = await getFilters();

  const candidates = sales
    .filter((s) => {
      const k = normalizeTitle(s.title);
      return titleToDrops.has(k) || titleToEvents.has(k);
    })
    .map((s) => {
      const k = normalizeTitle(s.title);
      const symbol = tokenLabel(s.price_token, tokenMap);
      const tinfo = tokenMap.get(s.price_token);
      const decimals = tinfo?.decimals ?? 0;
      const humanPrice = rawToHumanNumber(s.price, decimals);
      const drops = titleToDrops.get(k) ?? [];
      const events = titleToEvents.get(k) ?? [];
      return { sale: s, symbol, decimals, humanPrice, drops, events };
    })
    .filter((m) =>
      passesFilters(
        m.symbol,
        m.humanPrice,
        m.drops.map((d) => d.id),
        filters
      )
    );

  if (candidates.length === 0) return [];

  // Заклеймленность токена в каждой кампании.
  const tokenIds = Array.from(new Set(candidates.map((m) => m.sale.token_id)));
  const claimedRows =
    ((
      await pg.redemptions
        .raw()
        .select("token_id,campaign_id")
        .eq("contract_id", SENDLER_CONTRACT)
        .in("token_id", tokenIds)
    ).data as Array<{ token_id: string; campaign_id: string | null }>) ?? [];
  const claimedMap = new Map<string, Set<string>>();
  for (const r of claimedRows) {
    if (!r.campaign_id) continue;
    const set = claimedMap.get(r.token_id) ?? new Set();
    set.add(r.campaign_id);
    claimedMap.set(r.token_id, set);
  }

  const usable = candidates
    .map((m) => {
      const claimedFor = claimedMap.get(m.sale.token_id) ?? new Set();
      const drops = m.drops.filter((d) => !claimedFor.has(d.id));
      return { ...m, drops };
    })
    .filter((m) => m.drops.length > 0 || m.events.length > 0);

  return usable.sort((a, b) => {
    if (a.symbol === b.symbol) return a.humanPrice - b.humanPrice;
    return a.symbol.localeCompare(b.symbol);
  });
}

export interface MarketplaceStatsListing {
  saleId: number;
  title: string;
  tokenId: string;
  priceHuman: string;
  symbol: string;
  ownerId: string | null;
  drops: Array<{
    id: string;
    name: string;
    mode: "simple" | "combo";
    rewardSpec: string;
    requiredCount: number;
    ownedCount: number | null;
  }>;
  events: Array<{
    id: string;
    rewardTickets: number;
    requiredCount: number;
    ownedCount: number | null;
  }>;
}

export interface MarketplaceStats {
  interestingCount: number;
  listings: MarketplaceStatsListing[];
}

/**
 * Подсчёт «у меня на кошельках» по title через локальный кэш Sendler.
 * Если sisters пустой — возвращает null.
 */
async function ownedByTitle(
  titles: string[],
  sisters: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sisters.length === 0) return out;
  const { fetchSendlerNftsByTitle } = await import("./sendler");
  const sisterSet = new Set(sisters);
  await Promise.all(
    titles.map(async (title) => {
      try {
        const items = await fetchSendlerNftsByTitle(SENDLER_CONTRACT, title);
        const want = normalizeTitle(title);
        const strict = items.filter(
          (it) => normalizeTitle(it.title) === want
        );
        const list = strict.length > 0 ? strict : items;
        const owned = list.filter((it) =>
          sisterSet.has(it.owner_id ?? "")
        ).length;
        // ключ нормализуем — потому что caller передаёт оригинальный
        // title (может в разных регистрах для одного логического NFT)
        out.set(normalizeTitle(title), owned);
      } catch {
        // skip
      }
    })
  );
  return out;
}

export async function getMarketplaceStats(opts: {
  sisters?: string[];
} = {}): Promise<MarketplaceStats> {
  const usable = await pickFreshMatchingListings();
  const sisters = opts.sisters ?? [];

  // дедуп по нормализованному ключу, иначе для "Old motor" и "old motor"
  // получаем два Sendler-запроса.
  const titleByNorm = new Map<string, string>();
  for (const m of usable) {
    const k = normalizeTitle(m.sale.title);
    if (!titleByNorm.has(k)) titleByNorm.set(k, m.sale.title);
  }
  const uniqueTitles = Array.from(titleByNorm.values());
  const ownedMap =
    sisters.length > 0
      ? await ownedByTitle(uniqueTitles, sisters)
      : new Map<string, number>();

  return {
    interestingCount: usable.length,
    listings: usable.map((m) => {
      const owned = ownedMap.get(normalizeTitle(m.sale.title));
      return {
        saleId: m.sale.approval_id,
        title: m.sale.title,
        tokenId: m.sale.token_id,
        priceHuman: shortenHuman(m.humanPrice),
        symbol: m.symbol,
        ownerId: m.sale.owner_id ?? null,
        drops: m.drops.map((d) => ({
          id: d.id,
          name: d.name,
          mode: d.mode,
          rewardSpec: d.rewardSpec,
          requiredCount: d.requiredCount,
          ownedCount: typeof owned === "number" ? owned : null,
        })),
        events: m.events.map((e) => ({
          id: e.id,
          rewardTickets: e.rewardTickets,
          requiredCount: e.requiredCount,
          ownedCount: typeof owned === "number" ? owned : null,
        })),
      };
    }),
  };
}

export async function checkMarketplaceListings(): Promise<{
  fetched: number;
  matched: number;
  notified: number;
  ms: number;
}> {
  const t0 = Date.now();
  const usable = await pickFreshMatchingListings();
  const matched = usable.length;

  if (usable.length === 0) {
    return { fetched: 0, matched: 0, notified: 0, ms: Date.now() - t0 };
  }

  // Уже уведомлённые sale_id.
  const seenRows =
    ((
      await pg.notifiedMarketplaceListings
        .raw()
        .select("sale_id")
        .in(
          "sale_id",
          usable.map((m) => String(m.sale.approval_id))
        )
    ).data as Array<{ sale_id: string }>) ?? [];
  const seen = new Set(seenRows.map((r) => r.sale_id));
  const fresh = usable.filter((m) => !seen.has(String(m.sale.approval_id)));

  let notified = 0;
  for (const m of fresh) {
    const lines: string[] = [];
    lines.push(`🛒 <b>Новый лот в Sendler</b>`);
    lines.push("");
    lines.push(`<b>${escapeHtml(m.sale.title)}</b>`);
    lines.push(`Token #${m.sale.token_id}`);
    lines.push(
      `Цена: <b>${shortenHuman(m.humanPrice)} ${m.symbol}</b>`
    );
    if (m.sale.owner_id) {
      lines.push(`Продавец: <code>${escapeHtml(m.sale.owner_id)}</code>`);
    }
    lines.push("");
    if (m.drops.length > 0) {
      lines.push("Можно использовать в:");
      for (const d of m.drops) {
        const tag = d.mode === "combo" ? "[combo] " : "";
        lines.push(`• ${tag}${escapeHtml(d.name)} → ${d.rewardSpec}`);
      }
    }
    if (m.events.length > 0) {
      lines.push("");
      lines.push("Ticket-события:");
      for (const e of m.events) {
        lines.push(`• +${e.rewardTickets} билет(ов)`);
      }
    }

    // Per-NFT deep-link на Sendler не поддерживается (frontend не имеет
    // /nft/<id> route). Кидаем 2 кнопки: market-страницу контракта на сайте
    // и бот в TG. Юзер находит конкретный лот сам по title / token_id.
    const buttons = {
      inline_keyboard: [
        [
          {
            text: "🌐 Открыть Sendler",
            url: `https://sendler.xyz/market/${SENDLER_CONTRACT}`,
          },
          {
            text: "🤖 Sendler-бот",
            url: "https://t.me/nft_sender_yupland_bot",
          },
        ],
      ],
    };
    const ok = await tgSendMessage(MARKETPLACE_NOTIFY_TG, lines.join("\n"), {
      replyMarkup: buttons,
    });
    if (ok) {
      notified++;
      await pg.notifiedMarketplaceListings.upsert(
        {
          sale_id: String(m.sale.approval_id),
          token_id: m.sale.token_id,
          title: m.sale.title,
          price_raw: m.sale.price,
          price_token: m.sale.price_token,
        },
        { onConflict: "sale_id" }
      );
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  return {
    fetched: matched, // candidates after filter (поле было «всего лотов», теперь после фильтра)
    matched,
    notified,
    ms: Date.now() - t0,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"
  );
}
