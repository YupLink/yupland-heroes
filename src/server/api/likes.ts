// Голосование лайками за NFT для дропов.
//
// Flow:
//   1. Юзер заходит в /my-nfts → видит свой запас (auto-recharge daily).
//   2. Может купить лайки за билеты (курс из settings).
//   3. Голосует за NFT — если в списке нет, создаём кандидата на лету.
//   4. Когда current_likes >= target_likes → status='ready' + TG-нотификация админам.
//   5. Админ кликает в боте → /admin/likes?ready=ID → перенаправляется в форму дропа.
//   6. После создания дропа: target_likes вычитаются, status='completed'.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { likeAccountId, likeRow, addLikes, emptyLikeRow } from "../likesAccount";
import { pg, sb } from "../db/pg";
import type {
  PgLikePromocode,
  PgLikePromocodeActivation,
  PgLikeShopOffer,
  PgNftLikeCandidate,
  PgUserLikeBalance,
} from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { setAccountLikes } from "../accountBalances";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { secureRandom } from "@/lib/secureRandom";
import { guessGate } from "../rateGate";
import { goldForTicketPrice } from "@/lib/ticketGold";

// ──────── Settings helpers ────────

async function loadLikeSettings(): Promise<{
  dailyGrant: number;
  dailyMaxPool: number;
  targetFormula: "auto" | "fixed";
  // auto: target = baseMin + circulating × perNft
  targetBaseMin: number;
  targetPerNft: number;
  targetFixed: number;
  adminNotifyReady: boolean;
}> {
  const rows = await pg.settings.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, def: number) => {
    const v = map.get(k);
    if (!v) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  return {
    dailyGrant: num("likes_daily_grant", 1),
    dailyMaxPool: num("likes_daily_max_pool", 7),
    targetFormula: (map.get("likes_target_formula") as "auto" | "fixed") ?? "auto",
    // baseMin — константа-минимум (даже на 1 NFT юзер получает >= baseMin).
    targetBaseMin: num("likes_target_auto_min", 10),
    // perNft — сколько лайков добавляется за каждую NFT в коллекции.
    targetPerNft: num("likes_target_per_nft", 1),
    targetFixed: num("likes_target_fixed", 50),
    adminNotifyReady: (map.get("likes_admin_notify_ready") ?? "1") === "1",
  };
}

function computeTargetLikes(
  circulatingCount: number | null,
  s: Awaited<ReturnType<typeof loadLikeSettings>>,
): number {
  if (s.targetFormula === "fixed") return s.targetFixed;
  // target = baseMin + circulating × perNft
  const count = Math.max(0, circulatingCount ?? 0);
  return Math.max(1, s.targetBaseMin + count * s.targetPerNft);
}

// ──────── Поиск по каталогу NFT (collection_titles) для голосования ────────

/**
 * Список NFT-вариантов для голосования. Берётся из collection_titles
 * (то что отсканировано). Учитываем сожжённые: показываем только NFT
 * где `count - burnt_count > 0` (есть NFT не на darai_duplo).
 * Сортировка: по available DESC (массовые первыми).
 */
export const listNftCatalogForVoting = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    // Lazy auto-rescan: если данные старше 1 часа — запускаем в фоне,
    // не блокируя ответ. Пользователь получит свежие данные при следующем
    // запросе через ~30 сек.
    void (async () => {
      const { maybeBackgroundRescan } = await import("../likes-rescan");
      await maybeBackgroundRescan();
    })();

    // Берём с запасом — потом фильтруем available > 0 и берём top N
    let q = pg.collectionTitles
      .raw()
      .select("id, contract_id, title, image, count, burnt_count")
      .order("count", { ascending: false })
      .limit(data.limit * 3);
    if (data.query && data.query.trim()) {
      q = q.ilike("title", `%${data.query.trim()}%`);
    }
    const { data: rows } = await q;
    const items = (
      (rows ?? []) as Array<{
        id: string;
        contract_id: string;
        title: string;
        image: string | null;
        count: number;
        burnt_count: number;
      }>
    )
      .map((r) => ({
        id: r.id,
        contractId: r.contract_id,
        title: r.title,
        image: r.image,
        totalCount: r.count,
        burntCount: r.burnt_count ?? 0,
        availableCount: Math.max(0, r.count - (r.burnt_count ?? 0)),
      }))
      .filter((r) => r.availableCount > 0)
      .sort((a, b) => b.availableCount - a.availableCount)
      .slice(0, data.limit);

    // Подмешаем likes-инфу. Для каждой NFT смотрим ВСЕ кандидаты:
    //   - если есть pending/ready → берём оттуда current/target
    //   - если есть только completed/cancelled → следующий цикл будет
    //     baseTarget × 2^(prev_count), показываем такой target (превью)
    const normalizedTitles = items.map((i) => normalizeTitle(i.title));
    const { data: cands } =
      normalizedTitles.length > 0
        ? await pg.nftLikeCandidates
            .raw()
            .select(
              "id, contract_id, normalized_title, current_likes, target_likes, status, cycle_no",
            )
            .in("normalized_title", normalizedTitles)
        : { data: [] };
    type Cand = {
      id: string;
      contract_id: string;
      normalized_title: string;
      current_likes: number;
      target_likes: number;
      status: string;
      cycle_no: number | null;
    };
    // Группируем по (contract+title): active + done
    const byKey = new Map<string, { active: Cand | null; doneCount: number }>();
    for (const c of (cands ?? []) as Cand[]) {
      const key = `${c.contract_id}::${c.normalized_title}`;
      const entry = byKey.get(key) ?? { active: null, doneCount: 0 };
      if (c.status === "pending" || c.status === "ready") {
        entry.active = c;
      } else if (c.status === "completed" || c.status === "cancelled") {
        entry.doneCount += 1;
      }
      byKey.set(key, entry);
    }

    const settings = await loadLikeSettings();

    return items.map((i) => {
      const key = `${i.contractId}::${normalizeTitle(i.title)}`;
      const entry = byKey.get(key);
      // Активный кандидат — отдаём как есть
      if (entry?.active) {
        return {
          ...i,
          candidateId: entry.active.id,
          currentLikes: entry.active.current_likes,
          targetLikes: entry.active.target_likes,
          candidateStatus: entry.active.status,
        };
      }
      // Нет активного. Цикл = (число прошлых завершённых дропов через лайки) + 1.
      // Для NFT без прошлых дропов через лайки — cycle 1, множитель ×1.
      // Каждый завершённый цикл удваивает порог следующему.
      // Используем availableCount (= count - burntCount), а НЕ totalCount —
      // сожжённые/в дупле NFT не приносят ничего юзерам, не учитываем.
      const nextCycle = (entry?.doneCount ?? 0) + 1;
      const multiplier = Math.pow(2, nextCycle - 1);
      const previewTarget = computeTargetLikes(i.availableCount, settings) * multiplier;
      return {
        ...i,
        candidateId: null,
        currentLikes: 0,
        targetLikes: previewTarget,
        candidateStatus: null,
      };
    });
  });

// ──────── Мои NFT для голосования (фильтр «свои») ────────

/**
 * NFT, которыми владеет текущий юзер (по всем sister-кошелькам его TG),
 * с подмешанной likes-инфой — чтобы в разделе «Лайки» голосовать за СВОИ
 * NFT без ручного поиска каждой. Источник владения — pg.nfts (скан
 * инвентаря через Sendler, обновляется при заходе на /my-nfts).
 * Форма строки — как у listNftCatalogForVoting (клиент переиспользует UI).
 */
export const listMyNftsForVoting = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  // НФТ для голосования/лайк-майнинга — по ПОДКЛЮЧЁННЫМ кошам: отвязал кош,
  // его НФТ сразу не голосуют и не приносят лайки (строгое правило владельца).
  const { getConnectedSisterWallets } = await import("./user-shared");
  const sisters = await getConnectedSisterWallets(wallet);
  if (sisters.length === 0) return [];

  // Все владеемые токены по sister-кошелькам.
  const { data: ownedRows } = await pg.nfts
    .raw()
    .select("contract_id, name, image")
    .in("owner_wallet", sisters);
  const rows = (ownedRows ?? []) as Array<{
    contract_id: string;
    name: string;
    image: string | null;
  }>;
  if (rows.length === 0) return [];

  // Группируем по (contract, normalizedTitle): считаем сколько у меня штук.
  type Grp = {
    contractId: string;
    title: string;
    image: string | null;
    normTitle: string;
    myCount: number;
  };
  const groups = new Map<string, Grp>();
  for (const r of rows) {
    const title = (r.name ?? "").trim();
    if (!title) continue;
    const norm = normalizeTitle(title);
    const key = `${r.contract_id}::${norm}`;
    const g = groups.get(key);
    if (g) {
      g.myCount += 1;
      if (!g.image && r.image) g.image = r.image;
    } else {
      groups.set(key, {
        contractId: r.contract_id,
        title,
        image: r.image ?? null,
        normTitle: norm,
        myCount: 1,
      });
    }
  }
  const grpList = [...groups.values()].sort((a, b) => b.myCount - a.myCount);
  if (grpList.length === 0) return [];

  // Тираж (count/burnt) из collection_titles — для availableCount и target.
  const contractIds = [...new Set(grpList.map((g) => g.contractId))];
  const { data: ctRows } = await pg.collectionTitles
    .raw()
    .select("contract_id, title, image, count, burnt_count")
    .in("contract_id", contractIds);
  const ctByKey = new Map<string, { image: string | null; count: number; burnt: number }>();
  for (const c of (ctRows ?? []) as Array<{
    contract_id: string;
    title: string;
    image: string | null;
    count: number;
    burnt_count: number | null;
  }>) {
    ctByKey.set(`${c.contract_id}::${normalizeTitle(c.title)}`, {
      image: c.image,
      count: c.count,
      burnt: c.burnt_count ?? 0,
    });
  }

  // Прогресс лайков (кандидаты) — как в каталоге.
  const normTitles = grpList.map((g) => g.normTitle);
  const { data: cands } =
    normTitles.length > 0
      ? await pg.nftLikeCandidates
          .raw()
          .select(
            "id, contract_id, normalized_title, current_likes, target_likes, status, cycle_no",
          )
          .in("normalized_title", normTitles)
      : { data: [] };
  type Cand = {
    id: string;
    contract_id: string;
    normalized_title: string;
    current_likes: number;
    target_likes: number;
    status: string;
    cycle_no: number | null;
  };
  const byKey = new Map<string, { active: Cand | null; doneCount: number }>();
  for (const c of (cands ?? []) as Cand[]) {
    const key = `${c.contract_id}::${c.normalized_title}`;
    const entry = byKey.get(key) ?? { active: null, doneCount: 0 };
    if (c.status === "pending" || c.status === "ready") entry.active = c;
    else if (c.status === "completed" || c.status === "cancelled") entry.doneCount += 1;
    byKey.set(key, entry);
  }

  const settings = await loadLikeSettings();

  return grpList.map((g) => {
    const key = `${g.contractId}::${g.normTitle}`;
    const ct = ctByKey.get(key);
    const totalCount = ct?.count ?? g.myCount;
    const burntCount = ct?.burnt ?? 0;
    const availableCount = Math.max(0, totalCount - burntCount);
    const image = g.image ?? ct?.image ?? null;
    const entry = byKey.get(key);
    if (entry?.active) {
      return {
        id: key,
        contractId: g.contractId,
        title: g.title,
        image,
        totalCount,
        burntCount,
        availableCount,
        myCount: g.myCount,
        candidateId: entry.active.id,
        currentLikes: entry.active.current_likes,
        targetLikes: entry.active.target_likes,
        candidateStatus: entry.active.status,
      };
    }
    const nextCycle = (entry?.doneCount ?? 0) + 1;
    const multiplier = Math.pow(2, nextCycle - 1);
    const previewTarget = computeTargetLikes(availableCount, settings) * multiplier;
    return {
      id: key,
      contractId: g.contractId,
      title: g.title,
      image,
      totalCount,
      burntCount,
      availableCount,
      myCount: g.myCount,
      candidateId: null,
      currentLikes: 0,
      targetLikes: previewTarget,
      candidateStatus: null,
    };
  });
});

// ──────── Daily grant + balance ────────

// Грант — на аккаунт, и это теперь свойство схемы, а не проверка: строка
// баланса у игрока ровно одна, сколько бы кошельков он ни подключил.
async function ensureDailyGrant(
  account: string,
  s: Awaited<ReturnType<typeof loadLikeSettings>>,
): Promise<PgUserLikeBalance> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const bal = await pg.userLikeBalance.findOne({ account_id: account });
  if (!bal) {
    const row: PgUserLikeBalance = {
      ...emptyLikeRow(account),
      available: s.dailyGrant,
      last_daily_grant_at: today,
      lifetime_granted: s.dailyGrant,
    };
    await pg.userLikeBalance.insert(row);
    return row;
  }
  // Уже начисляли сегодня — пропускаем
  if (bal.last_daily_grant_at === today) return bal;
  // NUMERIC из supabase приходит строкой — приводим к числу.
  const curAvail = Number(bal.available);
  const curLifetime = Number(bal.lifetime_granted);
  // Up to dailyMaxPool — daily-бонус не выходит за кап. Если у юзера
  // mined-лайки уже выше cap'a — newAvailable=cap, grantedNow<0 → пропуск
  // (не уменьшаем, mined-лайки не трогаем).
  const newAvailable = Math.min(s.dailyMaxPool, curAvail + s.dailyGrant);
  const grantedNow = newAvailable - curAvail;
  if (grantedNow > 0) {
    await pg.userLikeBalance.update(
      { account_id: account },
      {
        available: newAvailable,
        last_daily_grant_at: today,
        lifetime_granted: curLifetime + grantedNow,
        updated_at: new Date().toISOString(),
      },
    );
    return {
      ...bal,
      available: newAvailable,
      last_daily_grant_at: today,
      lifetime_granted: curLifetime + grantedNow,
    };
  }
  // Пул заполнен — просто отмечаем дату чтобы не пытаться каждый запрос
  await pg.userLikeBalance.update(
    { account_id: account },
    { last_daily_grant_at: today, updated_at: new Date().toISOString() },
  );
  return { ...bal, last_daily_grant_at: today };
}

// ──────── Public: settings (для UI магазина лайков) ────────

export const getLikeSettingsPublic = createServerFn({ method: "GET" }).handler(async () => {
  const s = await loadLikeSettings();
  return {
    dailyGrant: s.dailyGrant,
    dailyMaxPool: s.dailyMaxPool,
  };
});

// ──────── Public: мой баланс ────────

export const myLikeBalance = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const account = await likeAccountId(wallet);
  const s = await loadLikeSettings();
  // Новичок получает один дневной грант, а не полный пул — иначе заводить
  // аккаунты было бы выгоднее, чем играть.
  let bal = await pg.userLikeBalance.findOne({ account_id: account });
  if (!bal) {
    const today = new Date().toISOString().slice(0, 10);
    const row: PgUserLikeBalance = {
      ...emptyLikeRow(account),
      available: s.dailyGrant,
      last_daily_grant_at: today,
      lifetime_granted: s.dailyGrant,
    };
    try {
      await pg.userLikeBalance.insert(row);
      bal = row;
    } catch {
      bal = (await pg.userLikeBalance.findOne({ account_id: account })) ?? row;
    }
  }
  // Write-through в единую таблицу балансов аккаунта (зеркало для отчётов).
  void setAccountLikes(wallet, Number(bal.available)).catch(() => {});
  // Округляем до 0.01. ВАЖНО: Math.round, НЕ floor — из-за float
  // 2.01*100 = 200.9999… и floor дал бы 2.00 (терялась 0.01).
  const round2 = (x: number) => Math.round(Number(x) * 100) / 100;
  return {
    available: round2(Number(bal.available)),
    maxPool: s.dailyMaxPool,
    dailyGrant: s.dailyGrant,
    lifetimeGranted: round2(Number(bal.lifetime_granted)),
    lifetimePurchased: round2(Number(bal.lifetime_purchased)),
    lifetimeSpent: round2(Number(bal.lifetime_spent)),
    nextGrantAt: bal.last_daily_grant_at ?? null,
  };
});

/**
 * Доступные лайки игрока. Раньше здесь стягивали остатки с кошельков-сестёр —
 * теперь стягивать нечего: баланс у аккаунта один.
 */
export async function pullSiblingLikesTo(key: string): Promise<number> {
  const account = await likeAccountId(key);
  const bal = await pg.userLikeBalance.findOne({ account_id: account });
  return Math.round(Number(bal?.available ?? 0) * 100) / 100;
}

// ──────── Public: список кандидатов с поиском + пагинацией ────────

export const listLikeCandidates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().optional(),
        status: z
          .enum(["pending", "ready", "completed", "cancelled", "active"])
          .optional()
          .default("active"),
        page: z.number().int().min(0).optional().default(0),
        pageSize: z.number().int().min(1).max(100).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    // active = pending OR ready (исключаем completed/cancelled)
    let q = pg.nftLikeCandidates.raw().select("*", { count: "exact" });
    if (data.status === "active") {
      q = q.in("status", ["pending", "ready"]);
    } else {
      q = q.eq("status", data.status);
    }
    if (data.query && data.query.trim()) {
      const term = data.query.trim();
      q = q.ilike("display_title", `%${term}%`);
    }
    q = q
      .order("current_likes", { ascending: false })
      .order("created_at", { ascending: false })
      .range(data.page * data.pageSize, (data.page + 1) * data.pageSize - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(`list candidates: ${error.message}`);

    // Лайки текущего юзера на этих кандидатов — для UI "уже отдал N"
    let myLikesMap = new Map<string, number>();
    if (wallet && rows && rows.length > 0) {
      const ids = (rows as PgNftLikeCandidate[]).map((r) => r.id);
      const { data: myLikes } = await pg.nftLikes
        .raw()
        .select("candidate_id, count")
        .in("candidate_id", ids)
        .eq("wallet", wallet);
      myLikesMap = new Map(
        ((myLikes ?? []) as Array<{ candidate_id: string; count: number }>).map((l) => [
          l.candidate_id,
          l.count,
        ]),
      );
    }

    return {
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      rows: ((rows ?? []) as PgNftLikeCandidate[]).map((r) => ({
        id: r.id,
        contractId: r.contract_id,
        title: r.display_title,
        image: r.image_url,
        currentLikes: r.current_likes,
        targetLikes: r.target_likes,
        collectionCount: r.collection_count,
        progressPct: Math.min(
          100,
          Math.round((r.current_likes / Math.max(1, r.target_likes)) * 100),
        ),
        status: r.status,
        myLikes: myLikesMap.get(r.id) ?? 0,
        createdAt: r.created_at,
        cycleNo: r.cycle_no ?? 1,
        cycleMultiplier: Math.pow(2, (r.cycle_no ?? 1) - 1),
      })),
    };
  });

// ──────── Public: голосовать за кандидата ────────
// Если candidateId не передан, ищем по (contractId, title) → создаём если нет.

const SENDLER_DEFAULT_CONTRACT = "yuplandshop.mintbase1.near";

export const voteForCandidate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        candidateId: z.string().optional(),
        // Альтернатива candidateId — поиск/создание по title
        title: z.string().min(1).max(200).optional(),
        contractId: z.string().min(2).max(100).optional(),
        count: z.number().int().min(1).max(1000).default(1),
      })
      .refine((d) => !!d.candidateId || !!d.title, {
        message: "Нужен candidateId или title",
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    assertNotMaintenance(wallet);
    // Только TG-привязанные (anti-sybil)
    const user = await pg.users.findOne({ wallet });
    if (!user?.telegram_id) {
      throw new Error("Для голосования нужна привязка Telegram");
    }

    const s = await loadLikeSettings();

    // 1. Resolve кандидата
    let candidate: PgNftLikeCandidate | null = null;
    if (data.candidateId) {
      candidate = await pg.nftLikeCandidates.findOne({ id: data.candidateId });
      if (!candidate) throw new Error("Кандидат не найден");
    } else if (data.title) {
      const contractId = data.contractId ?? SENDLER_DEFAULT_CONTRACT;
      const normalized = normalizeTitle(data.title);
      // ВАЖНО: ищем только АКТИВНОГО кандидата (pending/ready). Если есть лишь
      // completed/cancelled (прошлый цикл с созданным дропом) — считаем что
      // активного нет → ниже создаём кандидата следующего цикла. Иначе старый
      // completed блокировал голосование «дроп уже создан».
      const { data: activeRows } = await pg.nftLikeCandidates
        .raw()
        .select("*")
        .eq("contract_id", contractId)
        .eq("normalized_title", normalized)
        .in("status", ["pending", "ready"])
        .limit(1);
      candidate = ((activeRows ?? [])[0] as PgNftLikeCandidate) ?? null;
      if (!candidate) {
        // Создаём новую запись. collection_count = available (count - в дупле),
        // т.к. сожжённые юзеру не достанутся — формула должна считать только реально доступные.
        const ct = await pg.collectionTitles.findOne({
          id: `${contractId}:${normalized}`,
        });
        const collectionCount = ct
          ? Math.max(0, ct.count - ((ct as { burnt_count?: number }).burnt_count ?? 0))
          : null;

        // Прогрессия по циклам:
        //   • Новая NFT (нет прошлых через-лайки дропов) → cycle_no=1, x1.
        //   • NFT с прошлыми циклами через лайки: cycle_no = max(maxPrev, count) + 1,
        //     каждый завершённый цикл удваивает порог следующему.
        const { data: prevRows } = await pg.nftLikeCandidates
          .raw()
          .select("id,cycle_no")
          .eq("contract_id", contractId)
          .eq("normalized_title", normalized)
          .in("status", ["completed", "cancelled"]);
        const prevList = (prevRows ?? []) as Array<{
          id: string;
          cycle_no: number | null;
        }>;
        const maxCycle = prevList.reduce((m, r) => Math.max(m, r.cycle_no ?? 0), 0);
        const cycleNo = Math.max(1, Math.max(maxCycle, prevList.length) + 1);
        const baseTarget = computeTargetLikes(collectionCount, s);
        const multiplier = Math.pow(2, cycleNo - 1);
        const targetLikes = baseTarget * multiplier;

        const newCandidate: PgNftLikeCandidate = {
          id: `lc_${nanoid(10)}`,
          contract_id: contractId,
          normalized_title: normalized,
          display_title: data.title.trim(),
          image_url: ct?.image ?? null,
          collection_count: collectionCount,
          target_likes: targetLikes,
          current_likes: 0,
          status: "pending",
          completed_drop_id: null,
          created_by_wallet: wallet,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          notified_at: null,
          cycle_no: cycleNo,
        };
        await pg.nftLikeCandidates.insert(newCandidate);
        candidate = newCandidate;
      }
    }
    if (!candidate) throw new Error("Кандидат не найден");
    if (candidate.status === "completed" || candidate.status === "cancelled") {
      throw new Error("Голосование закрыто (дроп уже создан)");
    }

    // 2. Создаём пустой user_like_balance row при первом voice если ещё нет.
    //    Дневной грант начисляется кроном (см. /api/cron/daily-likes),
    //    тут только обеспечиваем существование row для FOR UPDATE locks.
    const account = await likeAccountId(wallet);
    await likeRow(account);

    // 3. Atomic vote через PG function — списание + insert/update лайка +
    //    инкремент candidate ВНУТРИ одной транзакции с FOR UPDATE locks.
    //    Это устраняет race «списали баланс, но лайк не зачли».
    const { data: rpcRows, error: rpcErr } = await sb.rpc("vote_for_candidate_atomic", {
      p_wallet: wallet,
      p_account: account,
      p_candidate_id: candidate.id,
      p_count: data.count,
    });
    if (rpcErr) {
      // Мапим SQL-ошибки в человеко-читаемые
      const msg = rpcErr.message || String(rpcErr);
      if (msg.includes("not_enough_balance")) throw new Error("Не хватает лайков");
      if (msg.includes("candidate_not_found")) throw new Error("Кандидат не найден");
      if (msg.includes("candidate_closed")) throw new Error("Голосование закрыто");
      throw new Error(msg);
    }
    const row = (
      rpcRows as Array<{
        new_current_likes: number;
        status_changed: boolean;
        new_balance: number;
        already_voted: number;
      }>
    )[0];
    const newCurrent = row.new_current_likes;
    const newStatus =
      row.status_changed && candidate.status === "pending" ? "ready" : candidate.status;

    // 4. TG-нотификация админам при первом переходе в ready (не спамим повторно)
    if (
      newStatus === "ready" &&
      candidate.status === "pending" &&
      s.adminNotifyReady &&
      !candidate.notified_at
    ) {
      void notifyAdminsLikeCandidateReady(candidate.id).catch((err) => {
        console.error("[likes] notify admins failed:", err);
      });
    }

    return {
      ok: true,
      candidateId: candidate.id,
      newCurrentLikes: newCurrent,
      newStatus,
      remainingMyBalance: row.new_balance,
    };
  });

// ──────── Public: список пакетов лайков (магазин лайков) ────────

export const listLikeShopOffers = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await pg.likeShopOffers
    .raw()
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("tickets", { ascending: true });
  return ((data ?? []) as PgLikeShopOffer[]).map((o) => ({
    id: o.id,
    tickets: o.tickets,
    // Цена в билетах платится золотом ×500 (§8.61) — столько и спишется.
    gold: goldForTicketPrice(o.tickets),
    likes: o.likes,
    priceStars: o.price_stars,
    sortOrder: o.sort_order,
    // Эффективный курс — отношение лайков к билетам, для подсветки бонуса
    ratio: o.likes / o.tickets,
  }));
});

// ──────── Public: купить пакет лайков — за золото (§8.61), likes-gold-buy.ts ────────

export { buyLikePackage } from "./likes-gold-buy";

// ──────── Admin: CRUD для пакетов лайков ────────

export const adminListLikeShopOffers = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
  const { data } = await pg.likeShopOffers
    .raw()
    .select("*")
    .order("sort_order", { ascending: true })
    .order("tickets", { ascending: true });
  return ((data ?? []) as PgLikeShopOffer[]).map((o) => ({
    id: o.id,
    tickets: o.tickets,
    likes: o.likes,
    priceStars: o.price_stars,
    active: o.active,
    sortOrder: o.sort_order,
    createdAt: o.created_at,
  }));
});

export const adminCreateLikeShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tickets: z.number().int().min(1).max(10000),
        likes: z.number().int().min(1).max(100000),
        priceStars: z.number().int().min(1).max(100000).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10000).optional().default(0),
        active: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const offer: PgLikeShopOffer = {
      id: `lo_${nanoid(10)}`,
      tickets: data.tickets,
      likes: data.likes,
      price_stars: data.priceStars ?? null,
      active: data.active,
      sort_order: data.sortOrder,
      created_at: new Date().toISOString(),
    };
    await pg.likeShopOffers.insert(offer);
    return { ok: true, id: offer.id };
  });

export const adminUpdateLikeShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        tickets: z.number().int().min(1).max(10000).optional(),
        likes: z.number().int().min(1).max(100000).optional(),
        priceStars: z.number().int().min(1).max(100000).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const patch: Partial<PgLikeShopOffer> = {};
    if (data.tickets != null) patch.tickets = data.tickets;
    if (data.likes != null) patch.likes = data.likes;
    if (data.priceStars !== undefined) patch.price_stars = data.priceStars;
    if (data.sortOrder != null) patch.sort_order = data.sortOrder;
    if (data.active != null) patch.active = data.active;
    await pg.likeShopOffers.update({ id: data.id }, patch);
    return { ok: true };
  });

export const adminDeleteLikeShopOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    await pg.likeShopOffers.delete({ id: data.id });
    return { ok: true };
  });

// ──────── TG notify (lazy import чтобы не тянуть tg.ts в client) ────────

async function notifyAdminsLikeCandidateReady(candidateId: string): Promise<void> {
  const { sendTgMessageToAdmins, WEBAPP_URL } = await import("../tg");
  const cand = await pg.nftLikeCandidates.findOne({ id: candidateId });
  if (!cand) return;
  const targetUrl = `${WEBAPP_URL}/admin/likes?ready=${cand.id}`;
  const msg = [
    `🔔 <b>Готов к дропу</b>`,
    "",
    `"${cand.display_title}" набрал <b>${cand.current_likes}</b> лайков (нужно ${cand.target_likes}).`,
    "",
    `Жми кнопку ниже чтобы запустить дроп.`,
  ].join("\n");
  // Mini-App кнопка ведёт сразу на /admin/likes?ready=<id>. Без отдельной
  // текстовой ссылки — чтобы не было двух точек входа на разные URL.
  const res = await sendTgMessageToAdmins(msg, {
    replyMarkup: {
      inline_keyboard: [[{ text: "🚀 Запустить дроп", web_app: { url: targetUrl } }]],
    },
  });
  if (res.sent === 0) {
    console.warn(
      `[likes] notifyAdminsLikeCandidateReady: ни один админ не получил сообщение (sent=0, failed=${res.failed}). ` +
        `Проверь ADMIN_WALLETS env и привязку TG.`,
    );
    // НЕ ставим notified_at — оставляем кандидата для повторной попытки
    return;
  }
  await pg.nftLikeCandidates.update({ id: candidateId }, { notified_at: new Date().toISOString() });
}

// ──────── Admin: переотправить нотификацию (если не дошла) ────────

export const adminResendLikeReadyNotify = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ candidateId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    // Сбрасываем флаг чтобы notifyAdminsLikeCandidateReady снова отправил
    await pg.nftLikeCandidates.update({ id: data.candidateId }, { notified_at: null });
    await notifyAdminsLikeCandidateReady(data.candidateId);
    const cand = await pg.nftLikeCandidates.findOne({ id: data.candidateId });
    return { ok: true, sent: !!cand?.notified_at };
  });

// ──────── Admin: список кандидатов с фильтром по status ────────

export const adminListLikeCandidates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum(["all", "pending", "ready", "completed", "cancelled"])
          .optional()
          .default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    let q = pg.nftLikeCandidates
      .raw()
      .select("*")
      .order("status", { ascending: true })
      .order("current_likes", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return ((rows ?? []) as PgNftLikeCandidate[]).map((r) => ({
      id: r.id,
      contractId: r.contract_id,
      title: r.display_title,
      image: r.image_url,
      currentLikes: r.current_likes,
      targetLikes: r.target_likes,
      status: r.status,
      completedDropId: r.completed_drop_id,
      createdAt: r.created_at,
      notifiedAt: r.notified_at,
    }));
  });

// ──────── Admin: после создания дропа — отметить кандидата + списать ────────

export const adminMarkLikeCandidateDropped = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        candidateId: z.string().min(1),
        dropId: z.string().min(1), // ID созданной кампании
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const cand = await pg.nftLikeCandidates.findOne({ id: data.candidateId });
    if (!cand) throw new Error("Кандидат не найден");
    if (cand.status === "completed") return { ok: true, alreadyMarked: true };
    // Вычитаем target_likes из current (избыток оставляем). После этого
    // кандидат уже использован — статус completed, новые лайки не принимаем.
    const remainingLikes = Math.max(0, cand.current_likes - cand.target_likes);
    await pg.nftLikeCandidates.update(
      { id: data.candidateId },
      {
        current_likes: remainingLikes,
        status: "completed",
        completed_drop_id: data.dropId,
        updated_at: new Date().toISOString(),
      },
    );
    // Fire-and-forget рескан: после дропа часть NFT может уйти в дупло
    // (если юзеры сожгут призы) → пересчитываем каталог в фоне.
    void (async () => {
      const { maybeBackgroundRescan } = await import("../likes-rescan");
      await maybeBackgroundRescan();
    })();
    return { ok: true, remainingLikes };
  });

// ──────── Admin: настройки ────────

export const adminGetLikeSettings = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
  return await loadLikeSettings();
});

export const adminUpdateLikeSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        dailyGrant: z.number().int().min(0).max(100).optional(),
        dailyMaxPool: z.number().int().min(1).max(1000).optional(),
        ticketCostPerLike: z.number().int().min(1).max(1000).optional(),
        targetFormula: z.enum(["auto", "fixed"]).optional(),
        targetBaseMin: z.number().int().min(0).max(100000).optional(),
        targetPerNft: z.number().int().min(0).max(1000).optional(),
        targetFixed: z.number().int().min(1).max(100000).optional(),
        adminNotifyReady: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const updates: Array<{ key: string; value: string }> = [];
    if (data.dailyGrant != null)
      updates.push({ key: "likes_daily_grant", value: String(data.dailyGrant) });
    if (data.dailyMaxPool != null)
      updates.push({
        key: "likes_daily_max_pool",
        value: String(data.dailyMaxPool),
      });
    if (data.ticketCostPerLike != null)
      updates.push({
        key: "likes_ticket_cost_per_like",
        value: String(data.ticketCostPerLike),
      });
    if (data.targetFormula)
      updates.push({ key: "likes_target_formula", value: data.targetFormula });
    // Реюзаем существующий ключ likes_target_auto_min как targetBaseMin
    if (data.targetBaseMin != null)
      updates.push({
        key: "likes_target_auto_min",
        value: String(data.targetBaseMin),
      });
    if (data.targetPerNft != null)
      updates.push({
        key: "likes_target_per_nft",
        value: String(data.targetPerNft),
      });
    if (data.targetFixed != null)
      updates.push({
        key: "likes_target_fixed",
        value: String(data.targetFixed),
      });
    if (data.adminNotifyReady != null)
      updates.push({
        key: "likes_admin_notify_ready",
        value: data.adminNotifyReady ? "1" : "0",
      });
    for (const u of updates) {
      await pg.settings.upsert(u, { onConflict: "key" });
    }
    // target_likes у существующих кандидатов НЕ пересчитываем — формула
    // применяется только к новосоздаваемым. Это контракт с юзерами:
    // отдал лайк за цель X — цель X не меняется задним числом.
    return { ok: true };
  });

// ──────── Промокоды на лайки ────────

/** Нормализация кода: trim + uppercase. Хранится в БД и поиске в верхнем регистре. */
function normalizePromocode(s: string): string {
  return s.trim().toUpperCase();
}

// ──────── Public: активировать промокод ────────

export const redeemLikePromocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    assertNotMaintenance(wallet);
    // Коды словарные, тексты ошибок раньше подсказывали, где ты угадал.
    // Гард на подбор: десять попыток в минуту на кошелёк.
    await guessGate("promocode", wallet);
    const user = await pg.users.findOne({ wallet });
    if (!user?.telegram_id) {
      throw new Error("Для активации промокода нужна привязка Telegram");
    }

    const code = normalizePromocode(data.code);
    const promo = await pg.likePromocodes.findOne({ code });
    if (!promo) throw new Error("Промокод не найден");
    if (!promo.active) throw new Error("Промокод отключён");

    // Anti-sybil: один TG = одна активация. Проверим явно (даже без UNIQUE
    // index это даст человеко-читаемую ошибку до race-условия).
    const tgPrior = await pg.likePromocodeActivations
      .raw()
      .select("id")
      .eq("promocode_id", promo.id)
      .eq("telegram_id", user.telegram_id)
      .limit(1);
    if ((tgPrior.data ?? []).length > 0) {
      throw new Error("Этот промокод уже активирован с твоего аккаунта");
    }
    const walletPrior = await pg.likePromocodeActivations
      .raw()
      .select("id")
      .eq("promocode_id", promo.id)
      .eq("wallet", wallet)
      .limit(1);
    if ((walletPrior.data ?? []).length > 0) {
      throw new Error("Этот промокод уже активирован с этого кошелька");
    }

    // Roll награды
    const rewardMin = promo.reward_min;
    const rewardMax = promo.reward_max;
    const likes =
      rewardMin === rewardMax
        ? rewardMin
        : Math.floor(secureRandom() * (rewardMax - rewardMin + 1)) + rewardMin;

    // Проверка лимита
    if (promo.limit_type === "uses") {
      if (promo.max_uses != null && promo.used_count + 1 > promo.max_uses) {
        throw new Error("Лимит активаций исчерпан");
      }
    } else {
      if (promo.total_budget != null && promo.used_budget + likes > promo.total_budget) {
        // Если общий бюджет исчерпан — выдаём остаток (если > 0), иначе отказ
        const remaining = Math.max(0, promo.total_budget - promo.used_budget);
        if (remaining === 0) {
          throw new Error("Бюджет промокода исчерпан");
        }
        // Урезаем награду до остатка чтобы не уйти за бюджет
        return await finalizeRedeem({
          promo,
          wallet,
          telegramId: user.telegram_id,
          likes: remaining,
        });
      }
    }

    return await finalizeRedeem({
      promo,
      wallet,
      telegramId: user.telegram_id,
      likes,
    });
  });

async function finalizeRedeem(opts: {
  promo: PgLikePromocode;
  wallet: string;
  telegramId: number;
  likes: number;
}): Promise<{
  ok: true;
  likesAdded: number;
  newLikeBalance: number;
  code: string;
}> {
  // INSERT активации (UNIQUE constraint защитит от race-двойной активации)
  const actId = `pa_${nanoid(10)}`;
  try {
    const act: PgLikePromocodeActivation = {
      id: actId,
      promocode_id: opts.promo.id,
      wallet: opts.wallet,
      telegram_id: opts.telegramId,
      likes_awarded: opts.likes,
      activated_at: new Date().toISOString(),
    };
    await pg.likePromocodeActivations.insert(act);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      throw new Error("Этот промокод уже активирован");
    }
    throw err;
  }

  // Счётчики двигаем ОДНИМ условным UPDATE, а не записью абсолюта из снимка
  // строки: параллельные активации читали одно и то же число и затирали друг
  // друга, поэтому и лимит активаций, и бюджет пробивались. Ноль строк —
  // лимит уже выбран, и тогда снимаем свою активацию.
  const { sqlStr } = await import("./chips-utils");
  const { guardedSpend } = await import("./guarded-spend");
  const guard =
    opts.promo.limit_type === "uses"
      ? `(max_uses IS NULL OR used_count + 1 <= max_uses)`
      : `(total_budget IS NULL OR used_budget + ${Number(opts.likes)} <= total_budget)`;
  // Через ту же отметку: относительный инкремент иначе применяется дважды,
  // если транспорт вслепую повторит запрос, и лимит промокода тает быстрее.
  const bumped = await guardedSpend({
    table: "yuplink.like_promocodes",
    where: `id = ${sqlStr(opts.promo.id)}`,
    set: `used_count = used_count + 1, used_budget = used_budget + ${Number(opts.likes)}`,
    cond: guard,
    ret: "used_count",
  });
  if (!bumped.ok) {
    await pg.likePromocodeActivations.delete({ id: actId }).catch(() => undefined);
    throw new Error(
      opts.promo.limit_type === "uses" ? "Лимит активаций исчерпан" : "Бюджет промокода исчерпан",
    );
  }

  // Зачисляем лайки на баланс юзера (без cap maxPool — промокод-награда сверх
  // кепа). Атомарным инкрементом: запись абсолютом затирала списание, легшее
  // между чтением и записью.
  const s = await loadLikeSettings();
  const promoAccount = await likeAccountId(opts.wallet);
  const bal = await ensureDailyGrant(promoAccount, s);
  await addLikes(promoAccount, opts.likes);

  return {
    ok: true,
    likesAdded: opts.likes,
    newLikeBalance: Number(bal.available) + opts.likes,
    code: opts.promo.code,
  };
}

// ──────── Admin: создать промокод ────────

export const adminCreateLikePromocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(64),
        rewardMin: z.number().int().min(1).max(100000),
        rewardMax: z.number().int().min(1).max(100000),
        limitType: z.enum(["budget", "uses"]),
        totalBudget: z.number().int().min(1).max(10000000).optional(),
        maxUses: z.number().int().min(1).max(1000000).optional(),
      })
      .refine((d) => d.rewardMax >= d.rewardMin, {
        message: "rewardMax должен быть >= rewardMin",
      })
      .refine(
        (d) =>
          (d.limitType === "budget" && d.totalBudget != null) ||
          (d.limitType === "uses" && d.maxUses != null),
        { message: "Нужно указать totalBudget или maxUses в зависимости от limitType" },
      )
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    const code = normalizePromocode(data.code);
    if (code.length < 1) throw new Error("Пустой код");
    const { codeTaken } = await import("./promo/promo-taken"); // и среди новых промокодов
    if (await codeTaken(code)) throw new Error("Такой промокод уже существует");
    const row: PgLikePromocode = {
      id: `pc_${nanoid(10)}`,
      code,
      reward_min: data.rewardMin,
      reward_max: data.rewardMax,
      limit_type: data.limitType,
      total_budget: data.limitType === "budget" ? (data.totalBudget ?? null) : null,
      max_uses: data.limitType === "uses" ? (data.maxUses ?? null) : null,
      used_budget: 0,
      used_count: 0,
      active: true,
      created_by_wallet: wallet,
      created_at: new Date().toISOString(),
    };
    await pg.likePromocodes.insert(row);
    return { ok: true, id: row.id, code: row.code };
  });

export const adminListLikePromocodes = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
  const { data } = await pg.likePromocodes
    .raw()
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as PgLikePromocode[]).map((p) => ({
    id: p.id,
    code: p.code,
    rewardMin: p.reward_min,
    rewardMax: p.reward_max,
    limitType: p.limit_type,
    totalBudget: p.total_budget,
    maxUses: p.max_uses,
    usedBudget: p.used_budget,
    usedCount: p.used_count,
    active: p.active,
    createdAt: p.created_at,
  }));
});

export const adminToggleLikePromocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    await pg.likePromocodes.update({ id: data.id }, { active: data.active });
    return { ok: true };
  });

export const adminDeleteLikePromocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet || !isAdminWallet(wallet)) throw new Error("Только админ");
    await pg.likePromocodes.delete({ id: data.id });
    return { ok: true };
  });
