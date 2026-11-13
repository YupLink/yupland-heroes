import { z } from "zod";
import { pg } from "../db/pg";
import { SENDLER_DEFAULT_CONTRACT } from "./admin-helpers";
import { MAX_PACK_QTY } from "../random";
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";

// NFT-приз: пул, из которого юзеру роллится конкретный token при claim
export const nftPoolItemSchema = z.object({
  tokenId: z.string().min(1).optional(), // если знаем конкретный
  title: z.string().min(1).optional(), // если хотим из всех NFT с таким title
  weight: z.number().positive().default(1),
  count: z.number().int().positive().optional(), // макс. раз можно выдать (для title-mode)
});

type RewardKind = "ft" | "nft" | "pack" | "energy" | "custom";

// Tier: ft (rewardMin/Max+rewardToken), nft (nftTitle), pack (packId).
export const rewardTierSchema = z
  .object({
    weight: z.number().positive(),
    kind: z.enum(["ft", "nft", "pack", "energy", "custom"]).default("ft"),
    rewardMin: z.number().int().nonnegative().optional(),
    rewardMax: z.number().int().nonnegative().optional(),
    rewardToken: z.string().optional(),
    nftTitle: z.string().optional(),
    nftContract: z.string().optional(),
    packId: z.string().optional(),
    // Сколько паков выдать за один клейм (kind=pack). Пусто → 1.
    packQty: z.number().int().min(1).max(MAX_PACK_QTY).optional(),
    // Товар маркета (kind=custom): штук rewardMin..rewardMax; имя и картинка — для карточки.
    itemId: z.string().max(64).optional(),
    itemName: z.string().max(120).optional(),
    itemImage: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.kind === "energy" &&
      !((data.rewardMax ?? 0) >= 1 && (data.rewardMin ?? 0) >= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rewardMax"],
        message: "Для kind=energy нужен rewardMax ≥ 1",
      });
    }
    if (
      data.kind === "custom" &&
      !(
        data.itemId?.startsWith("cst_") &&
        (data.rewardMin ?? 0) >= 1 &&
        (data.rewardMax ?? 0) >= (data.rewardMin ?? 0) &&
        (data.rewardMax ?? 0) <= MAX_PACK_QTY
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemId"],
        message: `Для kind=custom нужен товар и количество 1–${MAX_PACK_QTY}`,
      });
    }
    if (data.kind === "nft" && !data.nftTitle?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nftTitle"],
        message: "Для kind=nft нужен непустой nftTitle",
      });
    }
    if (data.kind === "pack" && !data.packId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packId"],
        message: "Для kind=pack нужен packId",
      });
    }
    if (data.kind === "ft" && (data.rewardToken === "energy" || data.rewardToken === "custom")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rewardToken"],
        message: "Для kind=ft нужен настоящий токен",
      });
    }
    if (data.kind === "ft" && !data.rewardToken?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rewardToken"],
        message: "Для kind=ft нужен rewardToken",
      });
    }
  });

export const dropInputSchema = z.object({
  title: z.string().min(1),
  contractAddress: z.string().min(1).default(SENDLER_DEFAULT_CONTRACT),
  rewardMin: z.number().int().nonnegative(),
  rewardMax: z.number().int().nonnegative(),
  rewardToken: z.string().min(1),
  rewardTiers: z.array(rewardTierSchema).optional().nullable(),
  maxTotalPool: z.number().int().positive().optional().nullable(),
  maxUsers: z.number().int().positive().optional().nullable(),
  freeClaim: z.boolean().optional().default(false),
  ticketCost: z.number().int().positive().optional().default(1), // колонка integer: дробь округлилась бы до 0 (бесплатный дроп)
  recurring: z.boolean().optional().default(false),
  rewardKind: z.enum(["ft", "nft"]).default("ft"),
  nftContract: z.string().min(2).max(64).optional().nullable(),
  nftPool: z.array(nftPoolItemSchema).optional().nullable(),
  allowDuplicate: z.boolean().optional().default(false),
});

export async function validateTiers(
  tiers: Array<{ rewardToken?: string; kind?: RewardKind }> | null | undefined,
): Promise<void> {
  if (!tiers || tiers.length === 0) return;
  for (const t of tiers) {
    if (t.kind && t.kind !== "ft") continue;
    if (!t.rewardToken) continue;
    await assertTokenExists(t.rewardToken);
  }
}

/**
 * USDT дроп не раздаёт (ПРАВИЛА §8.49а): клеймы идут без сверки со «Свободно
 * USDT». Платит ft-тир, а без тиров — сам дроп (у NFT-дропа и у дропа из одних
 * nft/pack/energy-тиров символ верхнего уровня — заглушка, её не смотрим).
 */
export function assertCampaignNoUsdt(
  rewardToken: string,
  tiers: ReadonlyArray<{ kind?: string; rewardToken?: string }> | null | undefined,
  rewardKind?: string,
): void {
  const list = tiers ?? [];
  const tierUsdt = list.some((t) => (t.kind ?? "ft") === "ft" && isUsdt(t.rewardToken));
  const flatUsdt = list.length === 0 && rewardKind !== "nft" && isUsdt(rewardToken);
  if (tierUsdt || flatUsdt) throw new Error(USDT_BANNED_MSG);
}

export async function assertTokenExists(symbol: string): Promise<void> {
  // Заглушки дропов без токена: энергия и товар (символ из первого яруса).
  if (symbol === "energy" || symbol === "custom") return;
  const row = await pg.rewardTokens.findOne({ symbol });
  if (!row) throw new Error(`Неизвестный токен: ${symbol}`);
}

/**
 * Формирует описание награды для TG-уведомлений. Учитывает rewardTiers.
 */
export function describeRewardForTg(data: {
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  rewardTiers?:
    | Array<{
        kind?: RewardKind;
        nftTitle?: string;
        rewardToken?: string;
        itemName?: string;
      }>
    | null;
}): string {
  const tiers = data.rewardTiers ?? [];
  const goods = tiers.filter((t) => t.kind === "custom");
  if (goods.length > 0 && goods.length === tiers.length) {
    const names = Array.from(new Set(goods.map((t) => t.itemName || "товар")));
    return `товар — ${names.map((n) => `«${n}»`).join(" / ")}`;
  }
  const nftTiers = tiers.filter((t) => t.kind === "nft" && t.nftTitle);
  const ftTiers = tiers.filter((t) => t.kind !== "nft");
  if (nftTiers.length > 0 && ftTiers.length === 0) {
    const titles = Array.from(
      new Set(nftTiers.map((t) => t.nftTitle).filter(Boolean) as string[])
    );
    return titles.length === 1
      ? `NFT-приз — «${titles[0]}»`
      : `NFT-приз — ${titles.map((t) => `«${t}»`).join(" / ")}`;
  }
  if (nftTiers.length > 0 && ftTiers.length > 0) {
    const titles = nftTiers
      .map((t) => t.nftTitle)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    const ftRange =
      data.rewardMin === data.rewardMax
        ? `${data.rewardMin} ${data.rewardToken}`
        : `${data.rewardMin}–${data.rewardMax} ${data.rewardToken}`;
    return `случайный приз: ${ftRange} или NFT (${titles})`;
  }
  if (data.rewardMax === 0 && data.rewardMin === 0) {
    return "NFT-приз";
  }
  return data.rewardMin === data.rewardMax
    ? `${data.rewardMin} ${data.rewardToken}`
    : `${data.rewardMin}–${data.rewardMax} ${data.rewardToken}`;
}

