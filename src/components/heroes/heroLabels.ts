// Общие подписи и цвета редкости героя — чтобы не расползались по компонентам.
export const RARITY_COLOR: Record<string, string> = {
  // Обычный — серый: он есть в игре (стартовый герой), и без него подпись
  // и рамка у него пустовали (жалоба 16.09.2026).
  common: "#9ca3af",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
  unique: "#ff7043",
};

export const RARITY_LABEL: Record<string, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
  unique: "Уникальный",
};
