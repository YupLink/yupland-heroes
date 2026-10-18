import { randomInt } from "node:crypto";

export function rollReward(min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  return randomInt(min, max + 1);
}

/**
 * Один ярус награды: с заданным весом вероятности выпадает токен
 * в диапазоне rewardMin..rewardMax.
 */
export interface RewardTier {
  weight: number;
  /** "ft" (default), "nft" — nftTitle, "pack" — packId, "energy" — ⚡ по rewardMin/Max */
  kind?: "ft" | "nft" | "pack" | "energy";
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  /** Title NFT-приза если kind="nft" */
  nftTitle?: string;
  /** Контракт NFT-приза если kind="nft" */
  nftContract?: string;
  /** ID пака (yuplink.nft_packs) если kind="pack" */
  packId?: string;
  /** Сколько паков выдать за один клейм если kind="pack". По умолчанию 1. */
  packQty?: number;
  /** Имя пака (hydrate на серверной стороне для UI; в БД не хранится). */
  packName?: string;
}

/** Кол-во паков за клейм: целое 1..MAX_PACK_QTY. Мусор/пусто → 1. */
export const MAX_PACK_QTY = 100;

export function normalizePackQty(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_PACK_QTY, Math.max(1, Math.floor(n)));
}

/**
 * Парсинг JSON-строки из campaigns.reward_tiers в массив с минимальной
 * валидацией. Возвращает null если данные невалидны — caller должен
 * фолбэкнуть на классический rollReward по rewardMin/Max/Token.
 */
export function parseRewardTiers(json: string | null): RewardTier[] | null {
  if (!json) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const tiers: RewardTier[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const kind =
      o.kind === "nft"
        ? "nft"
        : o.kind === "pack"
          ? "pack"
          : o.kind === "energy"
            ? "energy"
            : "ft";
    if (typeof o.weight !== "number" || o.weight <= 0) return null;
    if (kind === "energy") {
      // ⚡-ярус: награда = целое кол-во энергии из rewardMin..rewardMax. Токена нет.
      const mn = typeof o.rewardMin === "number" ? o.rewardMin : 0;
      const mx = typeof o.rewardMax === "number" ? o.rewardMax : mn;
      if (mn < 0 || mx < mn || mx <= 0) return null;
      tiers.push({
        weight: o.weight,
        kind: "energy",
        rewardMin: mn,
        rewardMax: mx,
        rewardToken: "energy",
      });
      continue;
    }
    if (kind === "pack") {
      const packId =
        typeof o.packId === "string" && o.packId.trim().length > 0
          ? o.packId.trim()
          : null;
      if (!packId) return null;
      tiers.push({
        weight: o.weight,
        kind: "pack",
        rewardMin: 0,
        rewardMax: 0,
        rewardToken: typeof o.rewardToken === "string" ? o.rewardToken : "",
        packId,
        packQty: normalizePackQty(o.packQty),
        nftTitle:
          typeof o.nftTitle === "string" ? o.nftTitle : undefined,
      });
      continue;
    }
    if (kind === "nft") {
      // Для NFT-яруса rewardMin/Max/Token могут быть пустыми/0 — это OK.
      const nftTitle =
        typeof o.nftTitle === "string" && o.nftTitle.trim().length > 0
          ? o.nftTitle.trim()
          : null;
      if (!nftTitle) return null;
      tiers.push({
        weight: o.weight,
        kind: "nft",
        rewardMin: typeof o.rewardMin === "number" ? o.rewardMin : 0,
        rewardMax: typeof o.rewardMax === "number" ? o.rewardMax : 0,
        rewardToken:
          typeof o.rewardToken === "string" ? o.rewardToken : "",
        nftTitle,
        nftContract:
          typeof o.nftContract === "string" ? o.nftContract : undefined,
      });
      continue;
    }
    // FT-ярус
    if (
      typeof o.rewardMin !== "number" ||
      typeof o.rewardMax !== "number" ||
      typeof o.rewardToken !== "string" ||
      o.rewardMin < 0 ||
      o.rewardMax < o.rewardMin
    ) {
      return null;
    }
    tiers.push({
      weight: o.weight,
      kind: "ft",
      rewardMin: o.rewardMin,
      rewardMax: o.rewardMax,
      rewardToken: o.rewardToken,
    });
  }
  return tiers;
}

/**
 * Взвешенный выбор яруса.
 *
 * Семантика веса — ПРЯМОЙ ПРОЦЕНТ (1 = 1% шанс).
 * Если sum(weights) < 100 — оставшийся «хвост» уходит в виртуальный приз
 * «Молодец» (без награды). Это даёт админу прямое управление:
 *   ярус 1: weight=5 → 5% шанс на этот приз
 *   ярус 2: weight=10 → 10% шанс
 *   виртуальный «Молодец» → 85% шанс (без награды)
 *
 * Если sum > 100 — фактически нормализуется к 100% (нет «хвоста»),
 * что эквивалентно старому поведению.
 *
 * Возврат null означает выпало «Молодец» — caller должен учесть
 * (не выдавать FT/NFT награду, опционально показать поздравление).
 */
export function pickWeightedReward(
  tiers: RewardTier[]
): { amount: number; token: string; tier?: RewardTier } | null {
  const sum = tiers.reduce((s, t) => s + t.weight, 0);
  if (sum <= 0) {
    const t = tiers[0];
    return {
      amount: rollReward(t.rewardMin, t.rewardMax),
      token: t.rewardToken,
      tier: t,
    };
  }
  // total = max(100, sum). Если sum<100 → есть виртуальный «Молодец»-хвост.
  const total = Math.max(100, sum);
  const SCALE = 1_000_000;
  const totalScaled = Math.max(1, Math.floor(total * SCALE));
  const r = randomInt(0, totalScaled);
  let acc = 0;
  for (const t of tiers) {
    acc += Math.floor(t.weight * SCALE);
    if (r < acc) {
      return {
        amount: rollReward(t.rewardMin, t.rewardMax),
        token: t.rewardToken,
        tier: t,
      };
    }
  }
  // Выпало в «Молодец»-хвост (только когда sum<100).
  return null;
}
