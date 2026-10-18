// Цвет ободка объекта на карте: редкость артефакта и сила босса.
//
// Игроки просили «видеть редкость прямо на карте — свечением или как-то ещё»:
// раньше все объекты были обведены одинаковым фиолетовым, и легендарный
// артефакт ничем не отличался от рядового. Цвета — те же, что на карточках
// предметов (MysticInventoryCards), чтобы значения не расходились по экранам.
export const RARITY_RING: Record<string, string> = {
  common: "#9aa4bd",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

/** Обычный объект без редкости — прежний фиолетовый. */
export const RING_DEFAULT = "#a855f7";

/** Босс 11–25 уровня: зелёный — в редкостях предметов такого цвета нет. */
export const RING_GREEN = "#4ade80";

/**
 * Босс: редкости у него нет, зато есть уровень. Шкала владельца (21.09.2026):
 * 1–10 серый, 11–25 зелёный, 26–50 синий, 51–80 фиолетовый, 81–100 золотой.
 */
export function bossRing(level: number | null): string {
  const n = Number(level) || 0;
  if (n >= 81) return RARITY_RING.legendary;
  if (n >= 51) return RARITY_RING.epic;
  if (n >= 26) return RARITY_RING.rare;
  if (n >= 11) return RING_GREEN;
  return RARITY_RING.common;
}

/** Второе кольцо (вместо свечения) — только тому, что выше обычного: иначе карта пестрит. */
export const RING_GLOW = new Set([
  RING_GREEN,
  RARITY_RING.rare,
  RARITY_RING.epic,
  RARITY_RING.legendary,
]);

/** Ободки всех объектов карты: «objectId → цвет». Считается раз на карту. */
export function buildObjectRings(
  objects: Record<string, { kind?: string | null; rarity?: string | null; level?: number | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, o] of Object.entries(objects ?? {})) {
    const color =
      o?.kind === "boss"
        ? bossRing(o.level ?? null)
        : o?.rarity
          ? (RARITY_RING[o.rarity] ?? RING_DEFAULT)
          : RING_DEFAULT;
    out.set(id, color);
  }
  return out;
}
