// Общая мелочь для вкладок «Артефакты» и «Герои» админки /admin/chips.
// Вынесено из ItemsAdminPanel при разбивке на модули (§13 ПРАВИЛА.md):
// панель, карточка, раздача и редактор смотрят в один справочник цветов,
// чтобы редкость нигде не красилась «своим» оттенком.
import { adminListItems } from "@/server/api/items";
import { heroRarity, metaLabel } from "@/components/heroMeta";

export type ItemRow = Awaited<ReturnType<typeof adminListItems>>[number];

export const RARITY = ["common", "rare", "epic", "legendary"] as const;

export const RARITY_COLOR: Record<string, string> = {
  common: "#9aa4bd",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

// Уровни-звёзды = тиры редкости: 1 common (стартовый, из фишек не делается),
// 3 rare, 4 epic, 5 leg (дробные объединены). Common отличается только потолком
// уровня и числом мест — раса и спец у него ТАКИЕ ЖЕ обязательные: статы
// считаются по RACE_STATS[раса][спец] (lib/heroStats), строки «без спеца» там
// нет. Прежняя оговорка «common принимает пустые Раса/Спец» дала два шаблона с
// нулями на 70 героев (15.09.2026).
export const HERO_LEVELS = [1, 3, 4, 5];

/**
 * Уникальный герой — выпадает ровно один раз на всю игру.
 *
 * Признак живёт в meta шаблона, как и «убегает» у грибов: админка шлёт meta
 * целиком, отдельного поля в базе заводить не пришлось (server heroes-unique).
 */
export function isUniqueItem(meta: unknown): boolean {
  const v = (meta as { unique?: unknown } | null)?.unique;
  return v === true || String(v ?? "").toLowerCase() === "true";
}

/** Цвет обводки предмета: у героя — по уровню, у артефакта — по редкости. */
export function itemRing(it: ItemRow): string {
  const hr = it.kind === "hero" ? heroRarity(it.level) : null;
  if (hr) return hr.color;
  return it.rarity ? (RARITY_COLOR[it.rarity] ?? "#9aa4bd") : "#41d3c6";
}

/** Подпись-бейдж: у героя — «5★ Легендарный», у артефакта — редкость. */
export function itemBadge(it: ItemRow, lang: string): string {
  const hr = it.kind === "hero" ? heroRarity(it.level) : null;
  return hr ? hr.label : metaLabel(it.rarity, lang);
}

/** Значок-заглушка, когда у предмета нет картинки. */
export function itemGlyph(it: ItemRow): string {
  return it.kind === "hero" ? "♞" : "◆";
}
