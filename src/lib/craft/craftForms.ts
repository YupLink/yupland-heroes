// Формы артефакта по слотам: что именно рисует лаборатория. Выбор только из
// списка — свободного текста в запрос к нейросети не попадает ни символа.
import { ARTIFACT_SLOTS } from "@/components/heroMeta";

export type CraftSlot = (typeof ARTIFACT_SLOTS)[number];

export type CraftForm = {
  id: string;
  slot: CraftSlot;
  ru: string;
  en: string;
  /** Что просим нарисовать (англ., для нейросети). */
  draw: string;
  /** Длинное оружие — по диагонали, как у нынешних артефактов. */
  diagonal?: boolean;
  /** Сквозь предмет виден фон (кольцо, петля цепочки) — обработка снимает
   *  такие дыры; у остальных белое внутри — часть предмета (блик, мех). */
  holes?: boolean;
  /** Это существо (фамильяр, статуэтка) — зверя рисовать можно. */
  creature?: boolean;
};

const f = (
  id: string,
  slot: CraftSlot,
  ru: string,
  en: string,
  draw: string,
  diagonal = false,
  holes = false,
  creature = false,
): CraftForm => ({ id, slot, ru, en, draw, diagonal, holes, creature });

export const CRAFT_FORMS: readonly CraftForm[] = [
  f("helmet", "Голова", "Шлем", "Helmet", "helmet"),
  f("crown", "Голова", "Корона", "Crown", "crown"),
  f("hood", "Голова", "Капюшон", "Hood", "hood"),
  f("hat", "Голова", "Шляпа", "Hat", "hat"),
  f("amulet", "Шея", "Амулет", "Amulet", "amulet on a chain", false, true),
  f("necklace", "Шея", "Ожерелье", "Necklace", "necklace", false, true),
  f("pendant", "Шея", "Кулон", "Pendant", "pendant on a cord", false, true),
  // Без «chest»: модель рисовала по нему сундук (проба 11.11 — 3 из 3 сундуки).
  f("armor", "Тело", "Доспех", "Armor", "plate armor cuirass with shoulder pauldrons"),
  f("robe", "Тело", "Мантия", "Robe", "robe"),
  f("cloak", "Тело", "Плащ", "Cloak", "cloak"),
  f("sword", "Правая рука", "Меч", "Sword", "sword", true),
  f("axe", "Правая рука", "Топор", "Axe", "battle axe", true),
  f("staff", "Правая рука", "Посох", "Staff", "magic staff", true),
  f("mace", "Правая рука", "Булава", "Mace", "mace", true),
  f("spear", "Правая рука", "Копьё", "Spear", "spear", true),
  f("shield", "Левая рука", "Щит", "Shield", "shield"),
  f("dagger", "Левая рука", "Кинжал", "Dagger", "dagger", true),
  f("tome", "Левая рука", "Книга", "Tome", "spellbook tome"),
  f("lantern", "Левая рука", "Фонарь", "Lantern", "lantern"),
  f("gloves", "Руки", "Перчатки", "Gloves", "pair of gloves"),
  f("bracers", "Руки", "Наручи", "Bracers", "pair of bracers"),
  f("ring", "Руки", "Кольцо", "Ring", "ring", false, true),
  f("boots", "Ноги", "Сапоги", "Boots", "pair of boots"),
  f("greaves", "Ноги", "Поножи", "Greaves", "pair of leg greaves"),
  f("talisman", "Карманы", "Талисман", "Talisman", "talisman charm"),
  f("figurine", "Карманы", "Статуэтка", "Figurine", "small figurine", false, false, true),
  f("pouch", "Карманы", "Мешочек", "Pouch", "small pouch"),
  f(
    "familiar",
    "Карманы",
    "Фамильяр",
    "Familiar",
    "tiny pet creature familiar",
    false,
    false,
    true,
  ),
];

export const formById = (id: string): CraftForm | null =>
  CRAFT_FORMS.find((x) => x.id === id) ?? null;

export const formsOf = (slot: CraftSlot): CraftForm[] => CRAFT_FORMS.filter((x) => x.slot === slot);
