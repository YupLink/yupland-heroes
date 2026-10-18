import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg, type PgCampaign, type PgCollectionTitle, type PgNft } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { parseRewardTiers } from "../random";
import { fetchPackNames, hydratePackNames, collectPackIds } from "./pack-names";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner, fetchSendlerNftsByTitle } from "../sendler";

// ─── listAllActiveDrops ───────────────────────────────────────────────

/**
 * Дроп считается NFT-наградным если:
 *  - reward_kind = 'nft' (старая модель с pool), ИЛИ
 *  - в reward_tiers есть tier с kind='nft' или kind='pack' (приз-пак, чаще
 *    всего внутри только NFT).
 * Такие дропы скрываем от не-админов (пока тестируем).
 */
export function isNftRewardDrop(d: {
  reward_kind: string | null;
  reward_tiers: string | null;
}): boolean {
  if (d.reward_kind === "nft") return true;
  if (!d.reward_tiers) return false;
  try {
    const tiers = JSON.parse(d.reward_tiers) as Array<{ kind?: string }>;
    return tiers.some((t) => t.kind === "nft" || t.kind === "pack");
  } catch {
    return false;
  }
}

export const listAllActiveDrops = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  let drops = await pg.campaigns.findMany(
    { status: "active" },
    { orderBy: { column: "created_at", ascending: false } },
  );
  // Chip-target дропы — admin-only (early access).
  if (!isAdminWallet(wallet)) {
    drops = drops.filter((d) => !d.chip_collection_id);
  }
  if (drops.length === 0) return [];

  type Req = { title: string; count: number };
  const allTitles = new Set<string>();
  const dropsParsed = drops.map((d) => {
    let reqs: Req[] | null = null;
    if (d.mode === "combo" && d.requirements) {
      try {
        reqs = JSON.parse(d.requirements) as Req[];
      } catch {
        reqs = null;
      }
    }
    if (reqs) {
      for (const r of reqs) allTitles.add(`${d.contract_id}::${r.title}`);
    } else {
      allTitles.add(`${d.contract_id}::${d.name}`);
    }
    return { d, reqs };
  });

  // Подтягиваем preview-image+count из collection_titles одной выборкой.
  const titleArr = Array.from(allTitles).map((k) => {
    const [contractId, title] = k.split("::");
    return { contractId, title };
  });
  const ctRowsRaw =
    ((
      await pg.collectionTitles
        .raw()
        .select("*")
        .in(
          "title",
          titleArr.map((t) => t.title),
        )
    ).data as PgCollectionTitle[]) ?? [];
  const ctMap = new Map(ctRowsRaw.map((r) => [`${r.contract_id}::${r.title}`, r]));

  // Hydrate pack names for pack-tiers (чтобы карточка не показывала "0 HOPE").
  const parsedTiersByDrop = new Map<string, ReturnType<typeof parseRewardTiers>>();
  for (const { d } of dropsParsed) {
    parsedTiersByDrop.set(d.id, parseRewardTiers(d.reward_tiers));
  }
  const packNameById = await fetchPackNames(collectPackIds(parsedTiersByDrop.values()));

  return dropsParsed.map(({ d, reqs }) => {
    const primaryTitle = reqs && reqs.length > 0 ? reqs[0].title : d.name;
    const ct = ctMap.get(`${d.contract_id}::${primaryTitle}`);
    const requirementsWithMeta =
      reqs?.map((r) => {
        const rct = ctMap.get(`${d.contract_id}::${r.title}`);
        return {
          title: r.title,
          count: r.count,
          image: rct?.image ?? null,
          collectionCount: rct?.count ?? 0,
        };
      }) ?? null;
    const tiers = parsedTiersByDrop.get(d.id) ?? null;
    const tiersHydrated = hydratePackNames(tiers, packNameById);
    return {
      id: d.id,
      // Дедлайн = created_at + 30 дней (жизнь дропа) — для таймера в карточке.
      expiresAt: d.created_at
        ? new Date(new Date(d.created_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      title: d.name,
      contractId: d.contract_id,
      mode: d.mode as "simple" | "combo",
      rewardMin: d.reward_min,
      rewardMax: d.reward_max,
      rewardToken: d.reward_token,
      rewardTiers: tiersHydrated,
      freeClaim: d.free_claim,
      previewImage: ct?.image ?? null,
      collectionCount: ct?.count ?? 0,
      requirements: requirementsWithMeta,
    };
  });
});

// ─── Hidden campaigns (hide/unhide/list) ─────────────────────────────

// Хардкод: системный кошелёк, с которого админ размещает дропы.
// На нём всегда лежит куча NFT под активные дропы — чтобы не засорять UI,
// для НЕГО мы прячем дропы автоматически через 1 час после создания.
const SYSTEM_OWNER_HIDE_AFTER_MS = 60 * 60 * 1000; // 1 час
const SYSTEM_OWNER_WALLETS = new Set(["darai_collection.near"]);

/**
 * Ключ хранения «скрытых» для текущей сессии.
 * - если TG привязан → tg:<id> (общий для всех sister-wallets)
 * - иначе → w:<wallet>
 */
export async function getHiddenScopeKey(): Promise<string | null> {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const me = await pg.users.findOne({ wallet });
  if (me?.telegram_id) return `tg:${me.telegram_id}`;
  return `w:${wallet}`;
}

// ──────── User-managed hide-list ────────

export const hideCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const scopeKey = await getHiddenScopeKey();
    if (!scopeKey) throw new Error("Кошелёк не подключён");
    await pg.hiddenCampaigns.upsert(
      {
        id: `hc_${nanoid(10)}`,
        scope_key: scopeKey,
        campaign_id: data.campaignId,
      },
      { onConflict: "scope_key,campaign_id" },
    );
    return { ok: true };
  });

export const unhideCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const scopeKey = await getHiddenScopeKey();
    if (!scopeKey) throw new Error("Кошелёк не подключён");
    await pg.hiddenCampaigns.delete({
      scope_key: scopeKey,
      campaign_id: data.campaignId,
    });
    return { ok: true };
  });

/**
 * Список скрытых юзером кампаний. Возвращает {id, name, mode, rewardSpec}
 * для отображения в коллапс-блоке «Скрытые» в /my-nfts.
 */
export const listHiddenCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const scopeKey = await getHiddenScopeKey();
  if (!scopeKey) return [];
  const rows = await pg.hiddenCampaigns.findMany({ scope_key: scopeKey });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.campaign_id);
  const { data: camps, error } = await pg.campaigns.raw().select("*").in("id", ids);
  if (error) throw new Error(`pg.campaigns.in: ${error.message}`);
  const map = new Map(((camps as PgCampaign[]) ?? []).map((c) => [c.id, c]));
  return rows
    .map((r) => {
      const c = map.get(r.campaign_id);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        mode: (c.mode ?? "simple") as "simple" | "combo",
        rewardSpec:
          c.reward_min === c.reward_max
            ? `${c.reward_min} ${c.reward_token}`
            : `${c.reward_min}–${c.reward_max} ${c.reward_token}`,
        status: c.status,
        hiddenAt: r.hidden_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
});

// ─── listMyNfts + helpers ─────────────────────────────────────────────

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
  { at: number; data: Array<{ token_id: string; title: string; media: string }> }
>();

async function fetchNftsForOwnerOnChain(
  contractId: string,
  ownerId: string,
): Promise<Array<{ token_id: string; title: string; media: string }>> {
  const cacheKey = `${contractId}::${ownerId}`;
  const cached = nftsForOwnerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30_000) return cached.data;

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
        err instanceof Error ? err.message : err,
      );
      hadError = true;
      break;
    }
  }
  if (!hadError && all.length > 0) {
    nftsForOwnerCache.set(cacheKey, { at: Date.now(), data: all });
  }
  return all;
}

// ─── Inventory-first ownership ────────────────────────────────────────
//
// Раньше: для каждого (contract, title) дёргали title-search Sendler —
// N×M запросов на combo с N сетами и M юзерами. И Sendler флапал.
//
// Теперь: один раз тянем ПОЛНЫЙ список NFT юзера в контракте (1 запрос
// на (sister, contract), paginated). Все ownership-проверки — это
// локальный фильтр по title в полученной карте. Дёшево и атомарно:
// либо видим все NFT юзера, либо ни одной.
//
// Дополнительно — upsert в pg.nfts чтобы прогрев и для других кодпатов.
type SendlerLite = {
  token_id: string;
  title?: string;
  media?: string;
  owner_id?: string;
};
type OwnedIndex = Map<string, Map<string, SendlerLite[]>>;
type InventoryByContract = Map<string, SendlerLite[]>; // contract → all user's NFTs

const inventoryCache = new Map<string, { at: number; data: SendlerLite[] }>();
const INVENTORY_TTL_MS = 60_000;

async function loadUserInventory(
  contractIds: string[],
  sisters: string[],
): Promise<InventoryByContract> {
  // Источник №1: ВСЕГДА читаем нашу pg.nfts (быстро, без внешних API).
  // Cканер полным mirror'ом наполняет всю таблицу — 167k+ строк, покрывает
  // ~100% реальных NFT. Sendler в роли «опционального обновления свежими
  // данными» — но НЕ блокирует ответ если флапает 429.
  const result: InventoryByContract = new Map();
  for (const c of contractIds) result.set(c, []);

  // pg.nfts: один SELECT по всем (contractIds, sisters)
  try {
    const { data: localRows } = await pg.nfts
      .raw()
      .select("contract_id,token_id,name,image,owner_wallet")
      .in("contract_id", contractIds)
      .in("owner_wallet", sisters);
    for (const r of (localRows ?? []) as Array<{
      contract_id: string;
      token_id: string;
      name: string;
      image: string;
      owner_wallet: string | null;
    }>) {
      const arr = result.get(r.contract_id);
      if (!arr) continue;
      arr.push({
        token_id: r.token_id,
        title: r.name,
        media: r.image,
        owner_id: r.owner_wallet ?? "",
      });
    }
  } catch (err) {
    console.warn(
      "[loadUserInventory] pg.nfts read failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return result;
}

async function buildOwnedIndex(
  pairs: Array<{ contractId: string; title: string }>,
  sisters: string[],
): Promise<OwnedIndex> {
  const sisterSet = new Set(sisters);
  const index: OwnedIndex = new Map();

  // ─── Шаг 1: одним сетом тянем ПОЛНЫЕ инвентари юзера по каждому
  // контракту из dropList. Это покрывает 95%+ случаев — все юзерские
  // NFT любого title в нужных контрактах за один параллельный запрос.
  const uniqContracts = Array.from(new Set(pairs.map((p) => p.contractId)));
  const inventory = await loadUserInventory(uniqContracts, sisters);

  // Группируем pairs по contract → titles
  const titlesByContract = new Map<string, Set<string>>();
  for (const p of pairs) {
    const set = titlesByContract.get(p.contractId) ?? new Set();
    set.add(normalizeTitle(p.title));
    titlesByContract.set(p.contractId, set);
  }
  // Раскладываем inventory по (contract, normalizedTitle).
  for (const [contractId, items] of inventory) {
    const titlesNeeded = titlesByContract.get(contractId) ?? new Set();
    const byTitle = new Map<string, SendlerLite[]>();
    for (const it of items) {
      const norm = normalizeTitle(it.title);
      if (!titlesNeeded.has(norm)) continue;
      const arr = byTitle.get(norm) ?? [];
      arr.push(it);
      byTitle.set(norm, arr);
    }
    if (byTitle.size > 0) index.set(contractId, byTitle);
  }
  // Шаг 2 (backup) ОТКЛЮЧЁН — Sendler флапает и забивает функцию до
  // Vercel-таймаута. pg.nfts (167k+ строк, полный mirror) уже даёт ответ
  // в шаге 1 за миллисекунды. Свежие минты (последние минуты) могут
  // не попасть в выдачу до следующего фонового скана — это компромисс
  // ради скорости.
  const tasks = new Map<string, { contractId: string; title: string }>();
  if (false)
    for (const p of pairs) {
      const norm = normalizeTitle(p.title);
      const have = index.get(p.contractId)?.get(norm)?.length ?? 0;
      if (have > 0) continue;
      const k = `${p.contractId}::${norm}`;
      if (!tasks.has(k)) tasks.set(k, p);
    }

  await Promise.all(
    Array.from(tasks.values()).map(async ({ contractId, title }) => {
      try {
        const want = normalizeTitle(title);
        const mine: SendlerLite[] = [];

        // Источник 1: Sendler. Парсим всегда (если упал — пустой массив).
        // Sendler делает substring-поиск → strict-match по normalized title,
        // иначе под «Vihotka» подмешается «Vihotka (unique - 1 Lv)».
        try {
          const items = await fetchSendlerNftsByTitle(contractId, title);
          const strict = items.filter((it) => normalizeTitle(it.title) === want);
          const useList = strict.length > 0 ? strict : items;
          for (const it of useList) {
            if (sisterSet.has(it.owner_id ?? "")) mine.push(it);
          }
        } catch (err) {
          console.warn(
            `[buildOwnedIndex] Sendler title="${title}" failed:`,
            err instanceof Error ? err.message : err,
          );
        }

        // Источник 2: pg.nfts ВСЕГДА (а не только когда Sendler пусто).
        // Sendler флапает — отдаёт частичные списки, юзеры видят «после
        // каждого обновления разные NFT». Локальный кэш дёшев (1 SELECT)
        // и закрывает Sendler-промахи. Дедуп ниже по token_id.
        try {
          const { data: localRows } = await pg.nfts
            .raw()
            .select("*")
            .eq("contract_id", contractId)
            .in("owner_wallet", sisters);
          const local = (localRows as PgNft[]) ?? [];
          for (const n of local) {
            if (normalizeTitle(n.name) === want) {
              mine.push({
                token_id: n.token_id,
                title: n.name,
                media: n.image,
                owner_id: n.owner_wallet ?? "",
              });
            }
          }
        } catch (err) {
          console.warn(
            `[buildOwnedIndex] pg.nfts title="${title}" failed:`,
            err instanceof Error ? err.message : err,
          );
        }

        // Источник 3: NEAR RPC (on-chain) — last resort если оба верхних
        // пусто. Параллелим ВСЕ sister-кошельки и мерджим (раньше шли
        // sequential с break на первой находке — пропускали NFT если
        // юзер держит экземпляры на разных sister-ах). И главное:
        // pg.nfts сейчас наполнен на ~0.1% (сканер ломается), так что
        // RPC реально включается часто — sequential становился узким
        // местом и съедал бюджет Vercel-функции.
        if (mine.length === 0) {
          const perOwner = await Promise.all(
            sisters.map(async (owner) => {
              const onChain = await fetchNftsForOwnerOnChain(contractId, owner);
              return onChain
                .filter((n) => normalizeTitle(n.title) === want)
                .map((n) => ({
                  token_id: n.token_id,
                  title: n.title,
                  media: n.media,
                  owner_id: owner,
                }));
            }),
          );
          for (const arr of perOwner) mine.push(...arr);
        }

        // Дедуп по token_id (Sendler ∪ pg.nfts могут пересекаться).
        const seen = new Set<string>();
        const dedup = mine.filter((it) => {
          if (!it.token_id || seen.has(it.token_id)) return false;
          seen.add(it.token_id);
          return true;
        });
        let byTitle = index.get(contractId);
        if (!byTitle) {
          byTitle = new Map();
          index.set(contractId, byTitle);
        }
        byTitle.set(
          want,
          dedup.map((it) => ({
            token_id: it.token_id,
            title: it.title,
            media: it.media,
            owner_id: it.owner_id,
          })),
        );
      } catch (err) {
        // Частичный отказ не валит весь запрос, но фиксим в логе —
        // иначе непонятно, почему NFT внезапно «пропала» из combo.
        console.warn(
          `[buildOwnedIndex] title="${title}" contract=${contractId} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
  return index;
}

function getOwnedByTitle(index: OwnedIndex, contractId: string, title: string): SendlerLite[] {
  return index.get(contractId)?.get(normalizeTitle(title)) ?? [];
}

/**
 * Все кошельки, привязанные к тому же TG, что и переданный wallet.
 * Если у кошелька ещё нет TG — возвращает [wallet].
 * Используется для TG-агрегации билетов / клеймов / выплат.
 */
export { getSisterWallets } from "./user-shared";

// ─── Inventory scan через Sendler ─────────────────────────────────────

const MAIN_NFT_CONTRACT = "yuplandshop.mintbase1.near";
const USER_SCAN_THROTTLE_MS = 3 * 60_000; // не чаще раза в 3 минуты
// Память per-process для throttle. Между warm-инстансами Vercel не
// шарится — допустимо, scan дёшев. Главное чтобы один Vercel-инстанс
// не дёргал Sendler каждый рендер.
const _userScanAt = new Map<number, number>();

/** Скан inventory всех sister-кошельков юзера через Sendler по основному
 *  контракту (yuplandshop). Перезаписывает pg.nfts для этих owner'ов.
 *  Если Sendler упал — оставляет старые данные нетронутыми. */
async function scanUserInventoryViaSendler(wallet: string): Promise<{
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
      await pg.nfts.raw().delete().eq("contract_id", MAIN_NFT_CONTRACT).eq("owner_wallet", owner);
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
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { scanned, totalNfts };
}

/** Ленивый запуск scan'а. Если последний scan этого TG был меньше 3 минут
 *  назад — ничего не делает. Иначе запускает fire-and-forget (не блокирует
 *  caller). */
async function maybeScanUserInventory(wallet: string): Promise<void> {
  const me = await pg.users.findOne({ wallet });
  if (!me?.telegram_id) return;
  const last = _userScanAt.get(me.telegram_id) ?? 0;
  if (Date.now() - last < USER_SCAN_THROTTLE_MS) return;
  _userScanAt.set(me.telegram_id, Date.now());
  void scanUserInventoryViaSendler(wallet).catch((err) => {
    console.warn("[maybeScanUserInventory] failed:", err);
  });
}

export const listMyNfts = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) {
    return { groups: [], totalReady: 0, totalClaimed: 0 };
  }
  // Ленивый scan inventory через Sendler (не чаще раза в 3 минуты).
  // Не блокирует ответ — данные текущего запроса берутся из pg.nfts
  // как сейчас есть, а свежие подгрузятся к следующему рефрешу.
  void maybeScanUserInventory(wallet);

  // Все sister-кошельки этого TG — NFT собираем со всех.
  const { getSisterWallets } = await import("./user-shared");
  const sisters = await getSisterWallets(wallet);
  const sisterSet = new Set(sisters);

  // Системные кошельки в текущем sister-сете → автоскрытие старых дропов
  // (см. SYSTEM_OWNER_HIDE_AFTER_MS).
  const hasSystemOwner = sisters.some((w) => SYSTEM_OWNER_WALLETS.has(w));
  const systemHideThreshold = hasSystemOwner ? Date.now() - SYSTEM_OWNER_HIDE_AFTER_MS : null;

  // Скрытые юзером кампании (через UI eye-кнопку) для текущего scope.
  const scopeKey = await getHiddenScopeKey();
  const hiddenRows = scopeKey ? await pg.hiddenCampaigns.findMany({ scope_key: scopeKey }) : [];
  const hiddenSet = new Set(hiddenRows.map((r) => r.campaign_id));

  const activeDrops0 = await pg.campaigns.findMany({ status: "active" });
  let activeDrops = activeDrops0;

  // Chip-target дропы — admin-only (early access). У обычных юзеров
  // фишек на кошельке как NFT может не быть, или они в in-game форме —
  // не хотим показывать «бесплатный дроп» который они не могут забрать.
  if (!isAdminWallet(wallet)) {
    activeDrops = activeDrops.filter((d) => !d.chip_collection_id);
  }

  // Фильтр: системные старые дропы (полное исключение из выдачи —
  // юзер не может вернуть, это автоматически).
  if (systemHideThreshold !== null) {
    activeDrops = activeDrops.filter((d) => {
      const created = new Date(d.created_at).getTime();
      return Number.isFinite(created) ? created >= systemHideThreshold : true;
    });
  }
  // Скрытые юзером ОСТАВЛЯЕМ в выдаче и помечаем флагом — frontend
  // фильтрует их локально без перезапроса Sendler (мгновенное hide/unhide).

  if (activeDrops.length === 0) {
    return { groups: [], totalReady: 0, totalClaimed: 0 };
  }

  // ОДИН батч на все (contract, title) пары. Для simple — это drop.name.
  // Для combo — каждый title из requirements.
  // Для chip-target — все NFT-title'ы шаблонов коллекции × eligible уровней.
  const dropPairs: Array<{ contractId: string; title: string }> = [];
  // chip-target: id → массив eligible title'ов (для последующего рендеринга
  // simple-режима «сколько подходящих фишек у юзера»).
  const chipDropPairs = new Map<string, Array<{ contractId: string; title: string }>>();
  const { listChipDropEligibleTitles } = await import("./chips");
  for (const d of activeDrops) {
    if (d.chip_collection_id && d.chip_min_level != null) {
      const pairs = await listChipDropEligibleTitles(d.chip_collection_id, d.chip_min_level);
      chipDropPairs.set(d.id, pairs);
      for (const p of pairs) dropPairs.push(p);
      continue;
    }
    if (d.mode === "combo" && d.requirements) {
      try {
        const reqs = JSON.parse(d.requirements) as Array<{
          title: string;
          count: number;
        }>;
        for (const r of reqs) dropPairs.push({ contractId: d.contract_id, title: r.title });
      } catch {
        // malformed combo — пропустим
      }
    } else {
      dropPairs.push({ contractId: d.contract_id, title: d.name });
    }
  }
  const owned = await buildOwnedIndex(dropPairs, sisters);

  // Сначала — мои редемпшены (для показа моего amount/времени).
  // Один запрос ПО ВСЕМ sister-кошелькам этого TG (а не findMany без
  // фильтра по всей 60k+ таблице).
  const allRed = (await pg.redemptions.raw().select("*").in("wallet", sisters)).data as Awaited<
    ReturnType<typeof pg.redemptions.findMany>
  >;
  const myClaimMap = new Map(
    allRed
      .filter((r) => r.campaign_id)
      .map((r) => [
        `${r.campaign_id}:${r.contract_id}:${r.token_id}`,
        {
          contractId: r.contract_id,
          tokenId: r.token_id,
          amount: r.amount,
          redeemedAt: r.redeemed_at,
          campaignId: r.campaign_id,
        },
      ]),
  );

  // А теперь — ГЛОБАЛЬНЫЕ редемпшены по МОИМ token_id'ам на активных
  // дропах. Без этого UI показывал «ready» для NFT, которые УЖЕ были
  // заклеймлены другими юзерами раньше (combo не даёт клеймить один
  // token дважды — клик «Погасить» падал с «Нет полного набора»).
  const myTokens = new Set<string>();
  for (const [, byTitle] of owned) {
    for (const arr of byTitle.values()) {
      for (const it of arr) myTokens.add(it.token_id);
    }
  }
  const activeIds = activeDrops.map((d) => d.id);
  const globalClaimedKeys = new Set<string>();
  if (myTokens.size > 0 && activeIds.length > 0) {
    const { data: globalRed } = await pg.redemptions
      .raw()
      .select("campaign_id,contract_id,token_id")
      .in("campaign_id", activeIds)
      .in("token_id", [...myTokens]);
    for (const r of (globalRed ?? []) as Array<{
      campaign_id: string;
      contract_id: string;
      token_id: string;
    }>) {
      globalClaimedKeys.add(`${r.campaign_id}:${r.contract_id}:${r.token_id}`);
    }
  }
  // claimedMap.get(key) — фасад: возвращает либо мою запись (со amount),
  // либо stub если кто-то другой уже заклеймил (без amount/времени).
  // UI смотрит truthy чтобы пометить status=claimed; amount/redeemedAt
  // берёт через ?.amount — null означает «не моё».
  const claimedMap = {
    get(key: string): { amount: number | null; redeemedAt: string | null } | undefined {
      const mine = myClaimMap.get(key);
      if (mine) return { amount: mine.amount, redeemedAt: mine.redeemedAt };
      if (globalClaimedKeys.has(key)) return { amount: null, redeemedAt: null };
      return undefined;
    },
  };

  type DropItem = {
    tokenId: string;
    title: string;
    media: string;
    ownerWallet: string;
    status: "ready" | "claimed";
    claimedAmount: number | null;
    claimedAt: string | null;
  };
  type ComboReq = {
    title: string;
    count: number;
    owned: number; // не использованных в этом combo
    available: number; // = owned (alias для согласованности с ticket events UI)
    items: DropItem[];
    // Превью-картинка для случая когда items[] пустой (юзер ещё не
    // имеет ни одной NFT этого требования). Используется в chip-дропах
    // чтобы UI показывал ИЗОБРАЖЕНИЕ template'а а не пустоту.
    previewMedia?: string | null;
  };
  type DropGroup = {
    dropId: string;
    title: string;
    contractId: string;
    rewardMin: number;
    rewardMax: number;
    rewardToken: string;
    rewardTiers: Array<{
      weight: number;
      rewardMin: number;
      rewardMax: number;
      rewardToken: string;
    }> | null;
    freeClaim: boolean;
    ticketCost: number;
    mode: "simple" | "combo";
    items: DropItem[]; // используется для simple
    requirements?: ComboReq[]; // используется для combo
    availableClaims?: number; // только combo
    hidden: boolean; // скрыт юзером — рендерится в коллапс «Скрытые»
    // Дедлайн дропа = created_at + 30 дней (жизнь дропа). null если нет даты.
    // Клиент показывает обратный отсчёт (дд → чч:мм) в уголке карточки.
    expiresAt?: string | null;
  };

  const groups: DropGroup[] = [];
  for (const drop of activeDrops) {
    // Chip-target дроп: рендерим как combo с requirements =
    // список templates коллекции (по 1 шт каждого). Owned per template =
    // сумма всех NFT юзера данного template на любом eligible level.
    // Юзер просил «такой же список необходимых нфт #n название и звёзды
    // и отслеживание на кошельке необходимых».
    if (drop.chip_collection_id && drop.chip_min_level != null) {
      const pairs = chipDropPairs.get(drop.id) ?? [];
      const STORE = "yuplandshop.mintbase1.near";
      const minLvl = drop.chip_min_level;

      // Группируем eligible-titles по template_no через regex `#N <name>`.
      // listChipDropEligibleTitles генерирует канонические titles через
      // buildChipNftTitle (#{N} {coll} (X Stars[+])). Группировка по
      // ведущему #N даст нам разбиение по templates.
      const titlesByTemplate = new Map<number, string[]>();
      for (const p of pairs) {
        const m = p.title.match(/^#(\d+)\s/);
        if (!m) continue;
        const n = Number(m[1]);
        const arr = titlesByTemplate.get(n) ?? [];
        arr.push(p.title);
        titlesByTemplate.set(n, arr);
      }

      // Превью + название коллекции. Берём NAME ОДНОЙ коллекции для всех
      // template'ов (юзер: «название коллекции + к-во звёзд»). И отдельно
      // image_url каждого template'а для превью.
      const templateNos = Array.from(titlesByTemplate.keys()).sort((a, b) => a - b);
      const { data: tplRows } = await pg.chipTemplates
        .raw()
        .select("template_no,image_url")
        .eq("collection_id", drop.chip_collection_id)
        .in("template_no", templateNos);
      const tplImage = new Map<number, string>();
      for (const t of (tplRows ?? []) as Array<{
        template_no: number;
        image_url: string;
      }>) {
        tplImage.set(t.template_no, t.image_url);
      }
      const { data: colRow } = await pg.chipCollections
        .raw()
        .select("name")
        .eq("id", drop.chip_collection_id)
        .limit(1);
      const colName =
        ((colRow as Array<{ name?: string }> | null) ?? [])[0]?.name ??
        null ??
        (await pg.chipCollections.findOne({ id: drop.chip_collection_id }))?.name ??
        "Коллекция";

      // Для каждого template считаем мои NFT (любого eligible-уровня).
      const reqsOut: ComboReq[] = templateNos.map((n) => {
        const titles = titlesByTemplate.get(n) ?? [];
        const seenT = new Set<string>();
        const myItems: DropItem[] = [];
        for (const t of titles) {
          const m = getOwnedByTitle(owned, STORE, t);
          for (const it of m) {
            if (!it.token_id || seenT.has(it.token_id)) continue;
            seenT.add(it.token_id);
            const claimed = claimedMap.get(`${drop.id}:${STORE}:${it.token_id}`);
            myItems.push({
              tokenId: it.token_id,
              title: (it.title ?? "").trim() || t,
              media: it.media || "",
              ownerWallet: it.owner_id ?? "",
              status: claimed ? "claimed" : "ready",
              claimedAmount: claimed?.amount ?? null,
              claimedAt: claimed?.redeemedAt ?? null,
            });
          }
        }
        const ready = myItems.filter((i) => i.status === "ready").length;
        // Title: «#1 Retro figurine от 3⭐» (без дублей #N #N!).
        const displayTitle = `#${n} ${colName} от ${minLvl}⭐`;
        return {
          title: displayTitle,
          count: 1,
          owned: ready,
          available: ready,
          items: myItems.sort((a, b) =>
            a.status === b.status
              ? a.tokenId.localeCompare(b.tokenId)
              : a.status === "ready"
                ? -1
                : 1,
          ),
          previewMedia: tplImage.get(n) ?? null,
        };
      });

      // Скрываем дроп если у юзера НЕ ОДНОЙ подходящей NFT по любому
      // template'у. Точно как combo/simple — не захламляем выдачу
      // дропами которые юзер физически не может собрать (касается
      // ВСЕХ дропов, не только chip).
      const totalOwnedItems = reqsOut.reduce((s, r) => s + r.items.length, 0);
      if (totalOwnedItems === 0) continue;

      // availableClaims = сколько раз можем заклеймить (= min owned)
      let avail = Number.POSITIVE_INFINITY;
      for (const r of reqsOut) avail = Math.min(avail, r.owned);
      if (!Number.isFinite(avail)) avail = 0;

      groups.push({
        dropId: drop.id,
        title: drop.name,
        contractId: STORE,
        rewardMin: drop.reward_min,
        rewardMax: drop.reward_max,
        rewardToken: drop.reward_token,
        rewardTiers: parseRewardTiers(drop.reward_tiers),
        freeClaim: drop.free_claim,
        ticketCost: drop.ticket_cost ?? 1,
        mode: "combo",
        items: [],
        requirements: reqsOut,
        availableClaims: avail,
        hidden: hiddenSet.has(drop.id),
      });
      continue;
    }
    if (drop.mode === "combo") {
      let reqs: Array<{ title: string; count: number }> = [];
      try {
        reqs = JSON.parse(drop.requirements ?? "[]");
      } catch {
        reqs = [];
      }
      if (reqs.length === 0) continue;

      const reqsOut: ComboReq[] = reqs.map((req) => {
        const mine = getOwnedByTitle(owned, drop.contract_id, req.title);
        const items: DropItem[] = mine.map((it) => {
          const claimed = claimedMap.get(`${drop.id}:${drop.contract_id}:${it.token_id}`);
          return {
            tokenId: it.token_id,
            title: (it.title ?? "").trim() || req.title,
            media: it.media || "",
            ownerWallet: it.owner_id ?? "",
            status: claimed ? ("claimed" as const) : ("ready" as const),
            claimedAmount: claimed?.amount ?? null,
            claimedAt: claimed?.redeemedAt ?? null,
          };
        });
        const ready = items.filter((i) => i.status === "ready");
        return {
          title: req.title,
          count: req.count,
          owned: ready.length,
          available: ready.length,
          items: items.sort((a, b) =>
            a.status === b.status
              ? a.tokenId.localeCompare(b.tokenId)
              : a.status === "ready"
                ? -1
                : 1,
          ),
        };
      });

      // availableClaims = min floor(ready / count) по требованиям
      let avail = Number.POSITIVE_INFINITY;
      for (const r of reqsOut) {
        avail = Math.min(avail, Math.floor(r.owned / r.count));
      }
      if (!Number.isFinite(avail)) avail = 0;

      // Скип combo'у если ни одного НЕЗАКЛЕЙМЛЕННОГО NFT ни по одному
      // требованию (r.owned считает только status="ready", r.items.length
      // включает и claimed). Раньше тут было r.items.length — combo с
      // полностью заклеймленными NFT попадали в "Можно забрать" и
      // показывали кнопку «Погасить (0 комбо)» / ошибки на клик.
      const totalReady = reqsOut.reduce((s, r) => s + r.owned, 0);
      if (totalReady === 0) continue;

      groups.push({
        dropId: drop.id,
        title: drop.name,
        contractId: drop.contract_id,
        rewardMin: drop.reward_min,
        rewardMax: drop.reward_max,
        rewardToken: drop.reward_token,
        rewardTiers: parseRewardTiers(drop.reward_tiers),
        freeClaim: drop.free_claim,
        ticketCost: drop.ticket_cost ?? 1,
        mode: "combo",
        items: [],
        requirements: reqsOut,
        availableClaims: avail,
        hidden: hiddenSet.has(drop.id),
      });
      continue;
    }

    // simple
    const mine = getOwnedByTitle(owned, drop.contract_id, drop.name);
    if (mine.length === 0) continue;

    const cards: DropItem[] = mine.map((it) => {
      const claimed = claimedMap.get(`${drop.id}:${drop.contract_id}:${it.token_id}`);
      return {
        tokenId: it.token_id,
        title: (it.title ?? "").trim() || drop.name,
        media: it.media || "",
        ownerWallet: it.owner_id ?? "",
        status: claimed ? ("claimed" as const) : ("ready" as const),
        claimedAmount: claimed?.amount ?? null,
        claimedAt: claimed?.redeemedAt ?? null,
      };
    });
    cards.sort((a, b) => {
      if (a.status === b.status) return a.tokenId.localeCompare(b.tokenId);
      return a.status === "ready" ? -1 : 1;
    });

    groups.push({
      dropId: drop.id,
      title: drop.name,
      contractId: drop.contract_id,
      rewardMin: drop.reward_min,
      rewardMax: drop.reward_max,
      rewardToken: drop.reward_token,
      rewardTiers: parseRewardTiers(drop.reward_tiers),
      freeClaim: drop.free_claim,
      ticketCost: drop.ticket_cost ?? 1,
      mode: "simple",
      items: cards,
      hidden: hiddenSet.has(drop.id),
    });
  }

  // Группы с claimable выше
  groups.sort((a, b) => {
    const aReady = a.items.filter((i) => i.status === "ready").length;
    const bReady = b.items.filter((i) => i.status === "ready").length;
    if (aReady !== bReady) return bReady - aReady;
    return a.title.localeCompare(b.title);
  });

  let totalReady = 0;
  let totalClaimedFromGroups = 0;
  for (const g of groups) {
    for (const i of g.items) {
      if (i.status === "ready") totalReady++;
      else totalClaimedFromGroups++;
    }
  }

  // «Погашено» считаем по всем claims в истории (включая paused/ended
  // дропы — их paid clamps уже факт). Иначе при paused-нии дропа админом
  // счётчик у юзера обнулялся.
  // Берём anchor-row'ы (ticket_cost>0) + free-claim (amount>0).
  // Sister-кошельки учитываются.
  const { data: histRows } = await pg.redemptions
    .raw()
    .select("id")
    .in("wallet", sisters)
    .or("ticket_cost.gt.0,amount.gt.0");
  const totalClaimed = Math.max(totalClaimedFromGroups, (histRows ?? []).length);

  // Дедлайн каждого дропа = created_at + 30 дней (жизнь дропа). Клиент рисует
  // обратный отсчёт в уголке. ended-дропы сюда не попадают (status='active').
  const DROP_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
  const createdById = new Map(activeDrops.map((d) => [d.id, d.created_at]));
  for (const g of groups) {
    const c = createdById.get(g.dropId);
    g.expiresAt = c ? new Date(new Date(c).getTime() + DROP_LIFETIME_MS).toISOString() : null;
  }
  return { groups, totalReady, totalClaimed };
});

/** Принудительное обновление inventory. Без throttle. Дёргается из
 *  UI-кнопки «Обновить». Юзер ждёт результат. */
export const refreshMyInventory = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  try {
    const me = await pg.users.findOne({ wallet });
    if (me?.telegram_id) _userScanAt.set(me.telegram_id, Date.now());
    const res = await scanUserInventoryViaSendler(wallet);
    return { ok: true, ...res };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // MCP-DB временные сбои соединения. У клиента уже есть один авто-ретрай;
    // если оба раза не получилось — отдаём человеку понятную ошибку вместо
    // технического "no session path" / "SSE closed".
    if (/no session path|SSE closed|MCP timeout|MCP POST/i.test(msg)) {
      throw new Error("База временно недоступна, попробуй ещё раз через 5 секунд.");
    }
    throw err;
  }
});
