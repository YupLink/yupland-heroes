// Монетка или сундук — одно правило на всех.
//
// Вид шаблона у них ОБЩИЙ (kind = 'chest'), различает их только запас здоровья:
// монетка забирается одним касанием (maxHp = 1), сундук — это тысячи. Правило
// читают четверо: подбор шаблонов, счёт убитых, снятие с карты и список выбора
// в панели раздачи. Разъехавшись, оно показало бы админу в разделе «Монетки»
// большой сундук, а раскладка положила бы его в другую кучу.
//
// Здесь ЧИСЛА и разбор на JS; тот же разбор в терминах SQL — в
// server/api/beta-raid/pile-kind.ts, и константы он берёт отсюда.

/** Запас шаблона, у которого поле не заполнено. Не заполнено = сундук. */
export const DEFAULT_MAX_HP = 10_000;

/** До этого запаса включительно объект — монетка. */
export const COIN_MAX_HP = 1;

/**
 * Запас HP шаблона числом.
 *
 * Число берём как есть, строку — только если она целиком число: вписанное
 * руками «1 000» не число, и гадать за админа мы не будем. Всё непонятное —
 * DEFAULT_MAX_HP, то есть сундук: пусть лучше монетка попадёт к сундукам, чем
 * сундук раздастся как монетка (его вскрывают одним касанием).
 */
export function maxHpOf(meta: unknown): number {
  if (!meta || typeof meta !== "object") return DEFAULT_MAX_HP;
  const raw = (meta as Record<string, unknown>).maxHp;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : DEFAULT_MAX_HP;
  if (typeof raw === "string" && /^[0-9]+(\.[0-9]+)?$/.test(raw)) return Number(raw);
  return DEFAULT_MAX_HP;
}

/** Монетка ли это по мета-данным шаблона. */
export function isCoinTemplate(meta: unknown): boolean {
  return maxHpOf(meta) <= COIN_MAX_HP;
}
