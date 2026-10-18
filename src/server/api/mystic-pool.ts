// Пул призов мистического бокса: схема тира, разбор из БД, сумма шансов.
// Общая для конструктора (mystic.ts), открытия (mystic-open.ts) и симулятора.
import { z } from "zod";
import { AMOUNT_KINDS, MYSTIC_KINDS, MYSTIC_LEGACY_TOKENS } from "@/lib/mysticKinds";
import { REWARD_RESOURCES } from "@/lib/rewardKinds";
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";

// ── Схема пула призов ──
export const mysticTierSchema = z
  .object({
    kind: z.enum(MYSTIC_KINDS),
    weight: z.number().min(0.01).max(100), // вес = ПРЯМОЙ % шанс
    label: z.string().max(120).optional(), // отображаемое имя приза (для UI/reveal)
    // pack — пак фишек или другой бокс
    packId: z.string().max(60).optional(),
    // количество «от-до» (билеты, энергия, лайки, ресурс, товар, токен)
    amountMin: z.number().nonnegative().optional(),
    amountMax: z.number().nonnegative().optional(),
    token: z.string().max(40).optional(), // token: символ токена счёта
    resource: z.enum(REWARD_RESOURCES).optional(),
    customId: z.string().max(60).optional(), // свой товар cst_…
    customName: z.string().max(150).optional(),
    // nft (старое)
    nftTitle: z.string().max(200).optional(),
    nftContract: z.string().max(120).optional(),
    // artifact/hero — выбор из СОЗДАННЫХ (mystic_item_template)
    itemTemplateId: z.string().max(60).optional(),
    itemName: z.string().max(150).optional(),
    // legacy
    artifactRarity: z.enum(["common", "rare", "epic", "legendary"]).optional(),
    heroMinLevel: z.number().min(1).max(9).optional(),
  })
  .superRefine((t, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (t.kind === "pack" && !t.packId) bad("Выбери пак или бокс");
    if (AMOUNT_KINDS.includes(t.kind) && t.kind !== "ft") {
      if (t.amountMin == null || t.amountMax == null || t.amountMax < t.amountMin || !(t.amountMax > 0))
        bad("Заполни количество, например 10-30");
    }
    if (t.kind === "token" && !MYSTIC_LEGACY_TOKENS.includes(t.token ?? "")) bad("Выбери токен");
    if (t.kind === "resource" && !t.resource) bad("Выбери ресурс");
    if (t.kind === "custom" && !t.customId?.startsWith("cst_")) bad("Выбери свой товар");
    if ((t.kind === "artifact" || t.kind === "hero") && !t.itemTemplateId) bad("Выбери артефакт/героя из созданных");
  });

export const mysticPoolSchema = z.array(mysticTierSchema).min(1).max(50);
export type MysticTier = z.infer<typeof mysticTierSchema>;

/** Тир-токен с USDT: бокс выдаёт без предела, ПРАВИЛА §8.49а (старый ft — и так «пусто»). */
export const isUsdtTier = (t: { kind: string; token?: string }): boolean =>
  t.kind === "token" && isUsdt(t.token);

/** Пул к СОХРАНЕНИЮ: USDT — отказ. Разбор старого пула (parseMysticPool) терпимее. */
export const mysticPoolSaveSchema = mysticPoolSchema.refine((pool) => !pool.some(isUsdtTier), {
  message: USDT_BANNED_MSG,
});

/** Разбор mystic_pool из БД (jsonb) в массив тиров; null если пусто/битое. */
export function parseMysticPool(raw: unknown): MysticTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const r = mysticPoolSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Сумма весов и «хвост Молодец» — для превью шансов в UI. */
export function poolStats(pool: MysticTier[]): { sum: number; blankPct: number } {
  const sum = pool.reduce((s, t) => s + t.weight, 0);
  return { sum, blankPct: Math.max(0, 100 - sum) };
}

