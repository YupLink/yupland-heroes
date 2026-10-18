// Тип объекта на клетке, его подпись и способ взаимодействия.
//
// Босс — единственный, кто ведёт в бой: его окно с отрядом осталось как было.
// Сундук, монетка и артефакт забираются одним нажатием прямо с карты.
//
// Подписи переводятся, если компонент прокинул `t` (useT). Без него остаётся
// прежний русский текст — чтобы вызовы, которые ещё не знают про язык, жили.

import type { TFn } from "./effectMeta";

export type BetaObjectKind = "boss" | "chest" | "mine" | "artifact";

const KINDS: BetaObjectKind[] = ["boss", "chest", "mine", "artifact"];

const isKind = (v: unknown): v is BetaObjectKind =>
  typeof v === "string" && (KINDS as string[]).includes(v);

/**
 * Вид объекта. Приоритет — `kind` из шаблона (его отдаёт карта), дальше
 * префикс id (`boss:`/`chest:`) и meta.type для старых записей.
 */
export function objectKind(id: string, meta: unknown, kind?: string | null): BetaObjectKind {
  if (isKind(kind)) return kind;
  const prefix = id.includes(":") ? id.split(":")[0] : "";
  if (isKind(prefix)) return prefix;
  const t = (meta as Record<string, unknown> | null)?.type;
  if (isKind(t)) return t;
  return "chest";
}

/** Типы всех объектов словаря карты: objectId → вид (кэш кадра, раз на словарь). */
export function objectKindsOf(
  objects: Record<string, { kind?: string | null }> | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, o] of Object.entries(objects ?? {})) {
    out.set(id, objectKind(id, null, o?.kind));
  }
  return out;
}

/** Русские подписи по умолчанию — их же отдаёт сервер (BADGE_BY_KIND). */
const DEFAULT_BADGE: Record<BetaObjectKind, string> = {
  boss: "Босс",
  chest: "Сундук",
  mine: "Шахта",
  artifact: "Артефакт",
};

const BADGE_KEY: Record<BetaObjectKind, string> = {
  boss: "braid.kind_boss",
  chest: "braid.kind_chest",
  mine: "braid.kind_mine",
  artifact: "braid.kind_artifact",
};

/** Подпись вида объекта на языке игрока. */
export function kindLabel(kind: BetaObjectKind, t?: TFn): string {
  return t ? t(BADGE_KEY[kind]) : DEFAULT_BADGE[kind];
}

/** Подпись типа. Админ может задать свою в meta.badgeLabel — её не переводим. */
export function objectBadge(id: string, meta: unknown, kind?: string | null, t?: TFn): string {
  const custom = (meta as Record<string, unknown> | null)?.badgeLabel;
  if (typeof custom === "string" && custom.trim()) return custom;
  return kindLabel(objectKind(id, meta, kind), t);
}

/**
 * Подпись, пришедшая с сервера (encounter-peek.badgeLabel): дефолтную русскую
 * переводим, авторскую из meta.badgeLabel оставляем как написал админ.
 */
export function serverBadgeLabel(kind: string, label: string | null | undefined, t?: TFn): string {
  if (!isKind(kind)) return label ?? "";
  if (!label || label === DEFAULT_BADGE[kind]) return kindLabel(kind, t);
  return label;
}

/** HP объекта из шаблона: у монеток оно равно 1 — выбивать нечего. */
function maxHpOf(meta: unknown): number {
  const raw = (meta as Record<string, unknown> | null)?.maxHp;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

export type ObjectAction = {
  /** Надпись на кнопке. */
  label: string;
  /** Босс открывает окно с отрядом, остальные забираются сразу. */
  opensBattle: boolean;
  /** Цель падает с одного нажатия — можно гасить её на карте оптимистично. */
  instant: boolean;
};

/**
 * Что делать с объектом рядом.
 *
 * Сундук и артефакт забираются платой за подход, без отряда и без боя.
 * Монетка (HP = 1) подбирается одним нажатием. Шахта с боевым HP остаётся
 * прежним окном с отрядом.
 */
export function objectAction(kind: BetaObjectKind, meta: unknown, t?: TFn): ObjectAction {
  const label = (key: string, ru: string): string => (t ? t(key) : ru);
  if (kind === "boss")
    return { label: label("braid.act_fight", "В бой"), opensBattle: true, instant: false };
  const oneTap = maxHpOf(meta) <= 1;
  if (oneTap)
    return { label: label("braid.act_collect", "Забрать"), opensBattle: false, instant: true };
  // Артефакт и сундук забираются платой за подход, без отряда и без боя.
  if (kind === "artifact" || kind === "chest")
    return { label: label("braid.act_collect", "Забрать"), opensBattle: false, instant: false };
  return { label: label("braid.act_crack", "Вскрыть"), opensBattle: true, instant: false };
}
