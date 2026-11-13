// Черновик формы «Новый промокод»: поля строками (как их отдаёт ввод) → вход
// ручки adminCreatePromo. Проверки — те же ключи promo.err_*, что у сервера,
// чтобы форма отказывала до запроса. Чистая логика без React — под тест.
import { parsePromoRange } from "@/lib/promo/promoRange";
import { isValidPromoCode, normalizePromoCode } from "@/lib/promo/promoCode";
import {
  PROMO_MAX_AMOUNT,
  PROMO_MAX_USERS,
  promoMaxAmount,
  promoNeedsRef,
  promoOwnerOnly,
  isPromoNothing,
  type PromoKind,
} from "@/lib/promo/promoTypes";

export type LineDraft = {
  /** Ключ строки в списке React; на сервер не уходит. */
  key: string;
  kind: PromoKind;
  ref: string | null;
  title: string | null;
  image: string | null;
  /** «1-10» или «5». */
  amount: string;
  /** Вес строки (шанс = вес / сумма весов); пусто — 100. */
  chance: string;
  /** Объём строки; пусто — без предела. */
  budget: string;
};

export type PromoDraft = { code: string; maxUsers: string; lines: LineDraft[] };

let seq = 0;
const nextKey = (): string => `l${++seq}`;

/**
 * Новая строка вида; количество, шанс и объём переезжают. Ресурс сразу
 * «золото», токен — DARAI: пустой выбор админ не замечал (урок фонда наград).
 */
export function lineOfKind(kind: PromoKind, prev?: LineDraft): LineDraft {
  const ref = kind === "resource" ? "gold" : kind === "token" ? "Darai" : null;
  return {
    key: prev?.key ?? nextKey(),
    kind,
    ref,
    title: null,
    image: null,
    amount: prev?.amount ?? "1",
    chance: prev?.chance ?? "",
    budget: prev?.budget ?? "",
  };
}

/** Черновик с ключом нажатия «Создать». */
export type DraftState = { draft: PromoDraft; opId: string };

/**
 * Правка черновика — НОВЫЙ ключ нажатия. Повтор «Создать» после обрыва без
 * правок несёт прежний ключ (сервер узнает свой код), а правка после
 * потерянного ответа не должна молча вернуть прежний код со старыми строками.
 */
export const editDraft = (
  st: DraftState,
  p: Partial<PromoDraft>,
  newOp: () => string,
): DraftState => ({ draft: { ...st.draft, ...p }, opId: newOp() });

/** kind — вид первой строки (не админу — энергия: ресурса ему нельзя). */
export const emptyDraft = (kind: PromoKind = "resource"): PromoDraft => ({
  code: "",
  maxUsers: "",
  lines: [lineOfKind(kind)],
});

/** «12,5» → 12.5; пусто → fallback; мусор → NaN. */
const decimal = (s: string, fallback: number): number =>
  s.trim() === "" ? fallback : Number(s.trim().replace(",", "."));

/** Целое > 0 или null (пусто); мусор → NaN. */
const wholeOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
};

export type LineErrors = Partial<Record<"amount" | "chance" | "budget" | "ref", string>>;

/** Вес строки числом (пусто — 100; мусор — NaN). */
export const lineWeight = (l: LineDraft): number => decimal(l.chance, 100);

export function lineErrors(l: LineDraft): LineErrors {
  const out: LineErrors = {};
  if (isPromoNothing(l.kind)) {
    const w = decimal(l.chance, 100);
    if (!(w >= 0.001 && w <= 100)) out.chance = "promo.err_chance";
    return out;
  }
  const range = parsePromoRange(l.amount);
  if (!range) out.amount = "promo.err_amount";
  else if (range.max > promoMaxAmount(l.kind)) out.amount = "promo.err_amount_max";
  const chance = decimal(l.chance, 100);
  if (!(chance >= 0.001 && chance <= 100)) out.chance = "promo.err_chance";
  const budget = wholeOrNull(l.budget);
  if (Number.isNaN(budget) || (budget != null && budget > PROMO_MAX_AMOUNT)) {
    out.budget = "promo.err_number";
  }
  if (promoNeedsRef(l.kind) && !l.ref) out.ref = "promo.err_ref";
  if (l.kind === "token" && (l.ref ?? "").trim().toLowerCase() === "usdt") out.ref = "promo.err_usdt";
  // Токен — только с объёмом (сервер отказывает так же).
  if (promoOwnerOnly(l.kind) && !out.budget && budget == null) out.budget = "promo.err_token_budget";
  return out;
}

/** Первая ошибка черновика (ключ словаря) или null — можно слать. */
export function draftError(d: PromoDraft): string | null {
  const code = normalizePromoCode(d.code);
  if (code && !isValidPromoCode(code)) return "promo.err_code";
  const max = wholeOrNull(d.maxUsers);
  if (Number.isNaN(max) || (max != null && max > PROMO_MAX_USERS)) return "promo.err_number";
  if (d.lines.length === 0 || d.lines.every((l) => isPromoNothing(l.kind))) return "promo.err_no_lines";
  for (const l of d.lines) {
    const e = Object.values(lineErrors(l))[0];
    if (e) return e;
  }
  return null;
}

/** Черновик → вход adminCreatePromo (звать после draftError === null). */
export function draftToInput(d: PromoDraft, opId: string) {
  return {
    code: normalizePromoCode(d.code),
    maxUsers: wholeOrNull(d.maxUsers),
    opId,
    lines: d.lines.map((l) =>
      isPromoNothing(l.kind)
        ? { kind: l.kind, ref: null, title: null, image: null, amount: "1", chance: decimal(l.chance, 100), budget: null }
        : {
            kind: l.kind,
            ref: l.ref,
            title: l.title,
            image: l.image,
            amount: l.amount.trim(),
            chance: decimal(l.chance, 100),
            budget: wholeOrNull(l.budget),
          },
    ),
  };
}
