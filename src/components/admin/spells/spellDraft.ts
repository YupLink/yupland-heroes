// Черновик карточки заклинания в админке: то, что лежит в форме.
//
// Отдельно от SpellTpl (то, что читает игра): в форме числа живут строками —
// иначе стёртое поле «0» подставлялось бы прямо под пальцем и его нельзя было
// бы переписать. В цифры превращаем один раз, при отправке.
import type { SpellKind, SpellTpl } from "@/server/api/beta-raid/spell-tpl";
import type { BoostEffect } from "@/lib/hero/boost";

export type SpellDraft = {
  /** Пусто — заводим новое; иначе правим существующее. */
  id: string | null;
  name: string;
  description: string;
  image: string | null;
  effects: BoostEffect[];
  energyCost: string;
  cooldownMinutes: string;
  minInt: string;
  kind: SpellKind;
  active: boolean;
};

/**
 * Подписи видов — админка русскоязычная, словарь ей не нужен.
 *
 * Record<SpellKind, …> обязывает перечислить ВСЕ виды: появится новый в
 * spell-tpl — форма не соберётся, пока ему не дадут подпись. Отсюда же форма
 * берёт порядок пунктов селекта (SPELL_KIND_OPTIONS): сам список SPELL_KINDS
 * лежит в СЕРВЕРНОМ модуле, и импортировать его значением в клиентский
 * компонент нельзя — за ним в бандл уехал бы весь мост к базе.
 */
export const KIND_LABELS: Record<SpellKind, string> = {
  boost: "Обычное (эффекты герою)",
  summon_ship: "Призыв корабля",
  teleport_town: "Телепорт к замку",
  create_ship: "Создание корабля",
  repair_ship: "Ремонт корабля",
};

/** Виды для селекта — ключи подписей, без похода в серверный модуль. */
export const SPELL_KIND_OPTIONS = Object.keys(KIND_LABELS) as SpellKind[];

export const EMPTY_SPELL: SpellDraft = {
  id: null,
  name: "",
  description: "",
  image: null,
  effects: [],
  energyCost: "10",
  cooldownMinutes: "60",
  minInt: "0",
  kind: "boost",
  active: true,
};

export const draftOf = (s: SpellTpl): SpellDraft => ({
  id: s.id,
  name: s.name,
  description: s.description,
  image: s.image,
  effects: s.effects.map((e) => ({ ...e })),
  energyCost: String(s.energyCost),
  cooldownMinutes: String(s.cooldownMinutes),
  minInt: String(s.minInt),
  kind: s.kind,
  active: s.active,
});

const int = (v: string): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Что уедет на сервер. Пустое поле — это ноль, а не «оставь как было». */
export const payloadOf = (d: SpellDraft) => ({
  id: d.id,
  name: d.name.trim(),
  description: d.description.trim(),
  image: d.image,
  effects: d.effects,
  energyCost: int(d.energyCost),
  cooldownMinutes: int(d.cooldownMinutes),
  minInt: int(d.minInt),
  kind: d.kind,
  active: d.active,
});

/** Откат человеческим языком: «240 мин (4 ч)». Минуты — то, что в базе. */
export function cooldownHint(minutes: number): string {
  if (minutes <= 0) return "без отката";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${minutes} мин (${h} ч)` : `${minutes} мин (${h} ч ${m} мин)`;
}
