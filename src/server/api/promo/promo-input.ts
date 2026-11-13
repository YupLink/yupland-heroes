// Вход ручек промокодов (zod). Отказы — ключами словаря promo.err_*: форма
// админки проверяет то же самое заранее (promoDraft), сервер — последним.
import { z } from "zod";
import { REWARD_RESOURCES } from "@/lib/rewardKinds";
import { isUsdt } from "@/lib/usdtBanned";
import { parsePromoRange } from "@/lib/promo/promoRange";
import { isValidPromoCode, normalizePromoCode } from "@/lib/promo/promoCode";
import {
  PROMO_KINDS,
  PROMO_MAX_AMOUNT,
  PROMO_MAX_LINES,
  PROMO_MAX_USERS,
  promoMaxAmount,
  promoNeedsRef,
  promoOwnerOnly,
  isPromoNothing,
} from "@/lib/promo/promoTypes";

/** Ключ нажатия: одно нажатие — один ключ, повтор запроса — тот же. */
const opId = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);

export const redeemInput = z.object({
  code: z.string().min(1).max(64),
  opId,
});

const RESOURCES: readonly string[] = REWARD_RESOURCES;

export const lineInput = z
  .object({
    kind: z.enum(PROMO_KINDS),
    ref: z.string().trim().max(128).nullable(),
    title: z.string().trim().max(200).nullable(),
    image: z.string().trim().max(1000).nullable(),
    /** Количество одним полем: «1-10» или «5» (parsePromoRange). */
    amount: z.string().max(40),
    /** Вес строки [0,001; 100] (колонка chance): шанс = вес / сумма весов кода. */
    chance: z.number().min(0.001).max(100),
    /** Объём строки за всё время; null — без предела. */
    budget: z.number().int().positive().max(PROMO_MAX_AMOUNT).nullable(),
  })
  .superRefine((l, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    // «Ничего» — только вес: ссылку, количество и объём сервер сам обнуляет.
    if (isPromoNothing(l.kind)) return;
    const range = parsePromoRange(l.amount);
    if (!range) fail("promo.err_amount");
    else if (range.max > promoMaxAmount(l.kind)) fail("promo.err_amount_max");
    const ref = l.ref ?? "";
    if (promoNeedsRef(l.kind) && !ref) fail("promo.err_ref");
    if (l.kind === "resource" && ref && !RESOURCES.includes(ref)) fail("promo.err_ref");
    if (l.kind === "custom" && ref && !ref.startsWith("cst_")) fail("promo.err_ref");
    // USDT — живые деньги (§8.49а): в промокод не кладём ни при каком пределе.
    if (l.kind === "token" && isUsdt(ref)) fail("promo.err_usdt");
    // Токен — прямое начисление: без объёма строка раздавала бы без конца.
    if (promoOwnerOnly(l.kind) && l.budget == null) fail("promo.err_token_budget");
  });

export type LineInput = z.infer<typeof lineInput>;

export const createInput = z.object({
  /** Пусто — код придумает сервер (generatePromoCode). */
  code: z
    .string()
    .max(64)
    .transform(normalizePromoCode)
    .refine((c) => c === "" || isValidPromoCode(c), "promo.err_code"),
  /** Предел игроков; null — без предела. */
  maxUsers: z.number().int().positive().max(PROMO_MAX_USERS).nullable(),
  lines: z
    .array(lineInput)
    .min(1, "promo.err_no_lines")
    .max(PROMO_MAX_LINES)
    // Одни «Ничего» — не промокод.
    .refine((ls) => ls.some((l) => !isPromoNothing(l.kind)), "promo.err_no_lines"),
  opId,
});

export type CreateInput = z.infer<typeof createInput>;

export const idInput = z.object({ id: z.string().regex(/^pcd_[A-Za-z0-9_-]{6,64}$/) });

/** Список кодов: сколько показать (кнопка «Показать ещё» растит предел). */
export const listInput = z
  .object({ limit: z.number().int().min(1).max(5000) })
  .optional()
  .transform((d) => d?.limit ?? 50);

export const toggleInput = idInput.extend({ active: z.boolean() });
