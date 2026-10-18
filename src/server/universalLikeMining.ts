// Универсальный лайк-майнинг: каждая NFT из yuplandshop у юзера даёт
// +0.01 лайка в день. Считаем по факту количества на всех sister-кошельках.
//
// Виртуальный like-event с фиксированным ID. Не пишется в like_events,
// обрабатывается «вне БД» — в коде. like_claims пишется с этим event_id
// (если FK на like_events существует, в админ-stage первого использования
// можно создать stub-event один раз).
//
// Cooldown как у обычного like-стейкинга: 24ч база, cap 24/48ч с подпиской.

import { pg } from "./db/pg";
import { fetchSendlerNftsByOwner } from "./sendler";
import { evaluateFarmTokenCooldown, evaluateFarmTokenCooldownReadonly } from "./farmTokenCooldown";

export const UNIVERSAL_EVENT_ID = "__universal_nft_mining__";
const NFT_CONTRACT = "yuplandshop.mintbase1.near";

// Settings keys
const KEY_ACTIVE = "like_universal_mining_active";
const KEY_RATE = "like_universal_mining_rate_per_nft";
const DEFAULT_RATE = 0.01;

export async function getUniversalSettings(): Promise<{
  active: boolean;
  ratePerNft: number;
}> {
  const { data } = await pg.settings.raw().select("key,value").in("key", [KEY_ACTIVE, KEY_RATE]);
  const map = new Map(((data ?? []) as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]));
  // Default: ВКЛЮЧЕНО — юзер просил «изначально включенная».
  const active = (map.get(KEY_ACTIVE) ?? "true").toLowerCase() === "true";
  const rate = Number(map.get(KEY_RATE) ?? String(DEFAULT_RATE));
  return {
    active,
    ratePerNft: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE,
  };
}

export async function setUniversalActive(active: boolean): Promise<void> {
  const existing = await pg.settings.findOne({ key: KEY_ACTIVE });
  if (existing) {
    await pg.settings.update(
      { key: KEY_ACTIVE },
      { value: active ? "true" : "false" }
    );
  } else {
    await pg.settings.insert({ key: KEY_ACTIVE, value: active ? "true" : "false" });
  }
}

/** Сколько NFT yuplandshop у юзера на всех sister-кошельках.
 *  Делаем параллельно через Sendler. Best-effort: если Sendler упал —
 *  возвращаем 0 (не валим страницу). */
export async function listUserYuplandNftIds(
  sisters: string[]
): Promise<string[]> {
  if (sisters.length === 0) return [];
  const results = await Promise.all(
    sisters.map((w) =>
      fetchSendlerNftsByOwner(NFT_CONTRACT, w).catch((err) => {
        console.warn("[universalMining] sendler failed for", w, err);
        return [] as Array<{ token_id: string }>;
      })
    )
  );
  // Дедуп по token_id — на случай если один и тот же NFT числится у двух
  // sister'ов (не должно, но защитимся).
  const seen = new Set<string>();
  for (const arr of results) {
    for (const it of arr) {
      if (it.token_id) seen.add(it.token_id);
    }
  }
  return Array.from(seen);
}

export async function countUserYuplandNfts(
  sisters: string[]
): Promise<number> {
  return (await listUserYuplandNftIds(sisters)).length;
}

/** Виртуальный like-event для UI с расчётом accrued/canClaim.
 *  Поля совместимы с обычным `listMyLikeEvents`-объектом, плюс особый
 *  флаг `isUniversal` чтобы UI мог отрендерить отдельной карточкой. */
export type UniversalLikeEvent = {
  id: typeof UNIVERSAL_EVENT_ID;
  isUniversal: true;
  active: boolean;
  ratePerNft: number;
  nftCount: number;
  contractId: string;
  rewardLikes: number; // = ratePerNft * nftCount (rate/день суммарно)
  ratePerHour: number;
  baseHours: number;
  capHours: number;
  effectiveH: number;
  lastClaimMs: number;
  minClaimAtMs: number;
  accrued: number;
  maxAccrual: number;
  canClaimNow: boolean;
  serverNow: number; // серверные часы — клиент выравнивает свой Date.now()
  onCooldownCount: number; // сколько NFT сейчас на 1-дн КД (не фармят)
  cooldownFreeMs: number | null; // когда освободится ближайшая NFT
  // Поля для совместимости со стандартным UI компонентом
  requirements: Array<{ title: string; count: number }>;
  ownership: Array<{ title: string; count: number; owned: number; items: Array<{ tokenId: string }> }>;
  nComplete: number;
  comboCount: number;
  holdDurationSec: number;
};

/** Виртуальный event для юзера. null если выключено в админке. */
export async function buildUniversalEventForUser(
  wallet: string | null,
  sisters: string[],
  isSubscribed: boolean
): Promise<UniversalLikeEvent | null> {
  const settings = await getUniversalSettings();
  if (!settings.active) return null;

  const now = Date.now();
  // Берём реальные token_id и считаем КД: в фарм идут только годные NFT,
  // остальные — на 7-дн КД (переслали). Дисплей совпадает с claim.
  const allTokenIds = wallet ? await listUserYuplandNftIds(sisters) : [];
  // Readonly-оценка КД — ТА ЖЕ логика, что в claim (с клампом «старт с 0» для
  // токенов после КД), чтобы накопление на дисплее совпадало с выплатой 1:1.
  const cd =
    wallet && allTokenIds.length > 0
      ? await evaluateFarmTokenCooldownReadonly(
          NFT_CONTRACT,
          allTokenIds,
          wallet,
          now,
          sisters
        )
      : {
          eligible: new Set<string>(),
          clampSinceMs: new Map<string, number>(),
          onCooldownCount: 0,
          earliestFreeMs: null as number | null,
        };
  const nftCount = cd.eligible.size; // фармят только годные
  const rewardLikes = settings.ratePerNft * nftCount;

  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;

  // Последний клейм этого юзера для виртуального event'а
  let lastClaimMs = 0;
  if (wallet) {
    try {
      // Кулдаун — на аккаунт: лайки начисляются ему же, и гейт по адресам
      // обходился сменой кошелька.
      const { accountIdOf } = await import("./api/user-shared");
      const acc = await accountIdOf(wallet);
      const { data: rows } = acc
        ? await pg.likeClaims
            .raw()
            .select("claimed_at")
            .eq("event_id", UNIVERSAL_EVENT_ID)
            .eq("account_id", acc)
        : { data: [] };
      for (const r of (rows ?? []) as Array<{ claimed_at: string }>) {
        const ms = new Date(r.claimed_at).getTime();
        if (ms > lastClaimMs) lastClaimMs = ms;
      }
    } catch {
      /* пусто, кэш like_claims недоступен — считаем что не клеймил */
    }
  }

  // effectiveH — ТОЧНО как в performUniversalLikeClaim: свежий кош стартует с 0,
  // токены после КД клампятся на farming_since (фарм с 0), берём min. Раньше
  // дисплей брал полный elapsed/capHours → показывал больше, чем платил claim.
  let farmStartMs = 0;
  for (const t of cd.eligible) {
    const fs = cd.clampSinceMs.get(t);
    if (fs != null && fs > farmStartMs) farmStartMs = fs;
  }
  const walletElapsedH =
    lastClaimMs > 0 ? (now - lastClaimMs) / 3_600_000 : capHours;
  const farmElapsedH =
    farmStartMs > 0 ? (now - farmStartMs) / 3_600_000 : capHours;
  const effectiveH = Math.min(
    capHours,
    Math.max(0, Math.min(walletElapsedH, farmElapsedH))
  );
  const ratePerHour = rewardLikes / baseHours;
  const accrued = Math.floor(ratePerHour * effectiveH * 100) / 100;
  const maxAccrual = Math.floor(ratePerHour * capHours * 100) / 100;
  const minClaimAtMs =
    lastClaimMs > 0 ? lastClaimMs + MIN_CLAIM_HOURS * 3_600_000 : 0;
  const canClaimNow =
    nftCount > 0 &&
    accrued >= 0.01 &&
    (lastClaimMs === 0 || now >= minClaimAtMs);

  return {
    id: UNIVERSAL_EVENT_ID,
    isUniversal: true,
    active: settings.active,
    ratePerNft: settings.ratePerNft,
    nftCount,
    contractId: NFT_CONTRACT,
    rewardLikes,
    ratePerHour,
    baseHours,
    capHours,
    effectiveH,
    lastClaimMs,
    minClaimAtMs,
    accrued,
    maxAccrual,
    canClaimNow,
    serverNow: now, // для выравнивания часов клиента (universal идёт первым)
    onCooldownCount: cd.onCooldownCount,
    cooldownFreeMs: cd.earliestFreeMs,
    // Совместимость с UI: одно «синтетическое» требование на 1 NFT
    requirements: [{ title: "Любая NFT YupLand", count: 1 }],
    ownership: [
      {
        title: "Любая NFT YupLand",
        count: 1,
        owned: nftCount,
        items: [], // не передаём список token_id — это просто счётчик
      },
    ],
    nComplete: nftCount > 0 ? 1 : 0,
    comboCount: 0,
    holdDurationSec: baseHours * 3600,
  };
}

/** Клейм универсального майнинга. Возвращает количество лайков или null
 *  если ничего не накопилось. */
export async function performUniversalLikeClaim(
  wallet: string,
  sisters: string[],
  isSubscribed: boolean
): Promise<{ likesAwarded: number } | null> {
  const settings = await getUniversalSettings();
  if (!settings.active) {
    throw new Error("Универсальный майнинг отключён админом");
  }
  const allTokenIds = await listUserYuplandNftIds(sisters);
  if (allTokenIds.length === 0) {
    throw new Error("Нет NFT yuplandshop на твоих кошельках");
  }

  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;
  const now = Date.now();

  let lastClaimMs = 0;
  // Аккаунт резолвим ОДИН раз и им же и пишем, и начисляем: иначе строка
  // клейма ложится, окно сгорает, а начисление падает — четыре часа без лайков.
  const { accountOf } = await import("./api/user-shared");
  const claimAccount = await accountOf(wallet);
  const { data: rows } = await pg.likeClaims
    .raw()
    .select("claimed_at")
    .eq("event_id", UNIVERSAL_EVENT_ID)
    .eq("account_id", claimAccount);
  for (const r of (rows ?? []) as Array<{ claimed_at: string }>) {
    const ms = new Date(r.claimed_at).getTime();
    if (ms > lastClaimMs) lastClaimMs = ms;
  }
  if (lastClaimMs > 0 && (now - lastClaimMs) / 3_600_000 < MIN_CLAIM_HOURS) {
    throw new Error(`Слишком рано — минимум ${MIN_CLAIM_HOURS}ч между клеймами`);
  }

  // 7-дневный КД на пересылку + фарм с 0: в счёт идут ТОЛЬКО годные NFT
  // (не на КД, не свежепересланные, не первый показ). Та же карусельная
  // дыра, что и у обычного майнинга — здесь она тоже закрывается.
  const { eligible, clampSinceMs } = await evaluateFarmTokenCooldown(
    NFT_CONTRACT,
    allTokenIds,
    wallet,
    now,
    sisters
  );
  const nftCount = eligible.size;
  if (nftCount === 0) return null; // всё на КД / только переслали

  let farmStartMs = 0;
  for (const t of eligible) {
    const fs = clampSinceMs.get(t);
    if (fs != null && fs > farmStartMs) farmStartMs = fs;
  }
  // Не клеймил → capHours (не 0): ограничитель — farmElapsed/cap, а не 0.
  // Иначе первый клейм навсегда даёт 0 → null → дедлок.
  const walletElapsedH =
    lastClaimMs > 0 ? (now - lastClaimMs) / 3_600_000 : capHours;
  const farmElapsedH =
    farmStartMs > 0 ? (now - farmStartMs) / 3_600_000 : capHours;
  const effectiveH = Math.min(
    capHours,
    Math.max(0, Math.min(walletElapsedH, farmElapsedH))
  );
  const ratePerHour = (settings.ratePerNft * nftCount) / baseHours;
  const accrued = Math.floor(ratePerHour * effectiveH * 100) / 100;
  if (accrued < 0.01) return null;

  // Защита: если FK like_claims → like_events существует, нужен stub.
  // Создаём его тихо — upsert идемпотентен.
  try {
    await pg.likeEvents.upsert(
      {
        id: UNIVERSAL_EVENT_ID,
        contract_id: NFT_CONTRACT,
        requirements: "[]",
        reward_likes: 0,
        hold_duration_sec: baseHours * 3600,
        active: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch {
    /* нет FK — окей */
  }

  // Ключ строки — окно и аккаунт: второе нажатие упирается в первичный ключ,
  // а не в удачу (тот же приём, что у остальных фарм-клеймов).
  const { claimSlotId, isDuplicateRow } = await import("./api/farm-claim-slot");
  const slotId = claimSlotId("ulc", UNIVERSAL_EVENT_ID, claimAccount, now);
  try {
    await pg.likeClaims.insert({
    id: slotId,
    event_id: UNIVERSAL_EVENT_ID,
    account_id: claimAccount,
    wallet,
    token_ids: JSON.stringify({
      universal: true,
      nftCount,
      ratePerNft: settings.ratePerNft,
    }),
    likes_awarded: accrued,
    claimed_at: new Date().toISOString(),
    });
  } catch (e) {
    // Окно уже занято параллельным нажатием — вторая выдача не нужна.
    if (isDuplicateRow(e)) return { likesAwarded: 0 };
    throw e;
  }

  // Кладём лайки атомарным UPSERT: клеймы идут пачкой параллельно, и
  // read-modify-write терял начисления.
  const { addLikes } = await import("./likesAccount");
  await addLikes(claimAccount, accrued, "lifetime_granted", `mining:${slotId}`);

  return { likesAwarded: accrued };
}
