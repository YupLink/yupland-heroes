// Сколько у героя мест под артефакты — зависит от редкости.
//
// Владелец: «Рар — то что сейчас; Эпик — +2 кармана, +1 руки; Лег — +4
// кармана, +1 тело, +1 руки». То есть базовые восемь слотов есть у всех, а
// редкость только ДОБАВЛЯЕТ дубли уже существующих типов: rare 8, epic 11,
// legendary 14 мест.
//
// Ключ в hero_instance.equipped: первый слот каждого типа сохраняет СТАРОЕ
// имя («Карманы»), дубли получают суффикс («Карманы#2»). Иначе у всех, кто
// уже что-то надел, экипировка слетела бы — мигрировать данные нельзя.
//
// Модуль чистый (только ARTIFACT_SLOTS): его одинаково читают сервер
// (heroes-gear*.ts) и клиент (окно снаряжения).
import { ARTIFACT_SLOTS } from "@/components/heroMeta";
// Редкость берём из heroLevels, а не объявляем заново: там же лежат потолки
// уровня, и второй такой же union рано или поздно разошёлся бы с первым.
import type { HeroRarity } from "@/lib/heroLevels";

export type { HeroRarity };

/** Одно место под артефакт: ключ в equipped, тип слота и номер дубля. */
export type HeroSlotDef = {
  /** Что лежит ключом в hero_instance.equipped. */
  key: string;
  /** Тип слота из ARTIFACT_SLOTS — по нему подбираются подходящие предметы. */
  slot: string;
  /** Порядковый номер такого слота у героя, 1..N. */
  index: number;
};

/** Сколько ДОПОЛНИТЕЛЬНЫХ мест даёт редкость сверх базового одного. */
const EXTRA_SLOTS: Record<HeroRarity, Readonly<Record<string, number>>> = {
  common: {},
  rare: {},
  epic: { Карманы: 2, Руки: 1 },
  legendary: { Карманы: 4, Тело: 1, Руки: 1 },
};

/**
 * Common пользуется ТОЛЬКО этими слотами: голова, тело, правая рука, ноги.
 * Ни колец, ни шеи, ни левой руки, ни «руки в перчатке» — у обычного героя
 * их не бывает, и рисовать пустые «неснимаемые» плашки было бы враньём.
 * У остальных редкостей полный список ARTIFACT_SLOTS.
 */
const COMMON_SLOTS: readonly string[] = ["Голова", "Тело", "Правая рука", "Ноги"];

/**
 * Редкость героя из hero_instance.rarity. Всё незнакомое (короткое 'leg' из
 * heroRarity() и мусор) сводим к rare: лишних мест не выдаём, но и базовые
 * восемь у героя остаются — герой без слотов игроку не нужен. Common теперь
 * НЕ мусор — оставляем как есть, у него свой набор мест.
 */
export function normalizeHeroRarity(raw: string | null | undefined): HeroRarity {
  const r = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (r === "legendary" || r === "leg") return "legendary";
  if (r === "epic") return "epic";
  if (r === "common") return "common";
  return "rare";
}

/** Ключ места: первый слот типа — старое имя, дубли — с «#N». */
export const heroSlotKey = (slot: string, index: number): string =>
  index > 1 ? `${slot}#${index}` : slot;

/**
 * Разобрать ключ обратно. Ключ незнакомой формы считаем первым слотом такого
 * типа: висячую запись лучше показать в слоте, чем потерять предмет.
 */
export function parseHeroSlotKey(key: string): { slot: string; index: number } {
  const at = key.lastIndexOf("#");
  if (at <= 0) return { slot: key, index: 1 };
  const n = Number(key.slice(at + 1));
  if (!Number.isInteger(n) || n < 2) return { slot: key, index: 1 };
  return { slot: key.slice(0, at), index: n };
}

/** Все места героя по порядку: дубли идут сразу за первым слотом своего типа. */
export function heroSlots(rarity: string | null | undefined): HeroSlotDef[] {
  const norm = normalizeHeroRarity(rarity);
  // У common — свой короткий список, а не подмножество ARTIFACT_SLOTS через
  // EXTRA_SLOTS: дубли считаем от базовой «1 слот» ARTIFACT_SLOTS, и common
  // получил бы восемь пустых мест. Проходим по своим четырём вручную.
  const slots = norm === "common" ? COMMON_SLOTS : ARTIFACT_SLOTS;
  const extra = EXTRA_SLOTS[norm];
  const out: HeroSlotDef[] = [];
  for (const slot of slots) {
    const total = 1 + (extra[slot] ?? 0);
    for (let index = 1; index <= total; index += 1) {
      out.push({ key: heroSlotKey(slot, index), slot, index });
    }
  }
  return out;
}

/** Тип слота известен? Индекс не проверяем — вопрос про сам ARTIFACT_SLOTS. */
export const isKnownSlotType = (slot: string): boolean =>
  (ARTIFACT_SLOTS as readonly string[]).includes(slot);

/**
 * Первое свободное место под предмет этого типа. Свободных нет — отдаём
 * первое место типа: там предмет заменит надетый, как было до дублей.
 * null — тип слота герою вообще недоступен (незнакомый слот у шаблона).
 */
export function firstFreeSlotKey(
  rarity: string | null | undefined,
  slot: string,
  equipped: Record<string, string>,
): string | null {
  const same = heroSlots(rarity).filter((d) => d.slot === slot);
  if (same.length === 0) return null;
  return (same.find((d) => !equipped[d.key]) ?? same[0]).key;
}
