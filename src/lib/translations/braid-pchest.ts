import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Обычный сундук (владелец, 29.09.2026; ПРАВИЛА §8.22): окно сундука-склада,
// установка на свою или соседнюю клетку, «Забрать сундук», закапывание — и
// отказы сервера (pchest.*, chest.buried — их бросают ручки сундуков).
export const dict: Record<string, Entry> = {
  // Окно
  "pchest.title": { ru: "Сундук", en: "Chest" },
  "pchest.shared": { ru: "Общий сундук", en: "Shared chest" },
  "pchest.cells": { ru: "Сундук · {used}/{all}", en: "Chest · {used}/{all}" },
  "pchest.have": { ru: "В сундуке: {n}", en: "In the chest: {n}" },
  "pchest.put": { ru: "Положить", en: "Put in" },
  "pchest.take": { ru: "Забрать", en: "Take" },
  "pchest.pickup": { ru: "Забрать сундук", en: "Pick up the chest" },
  "pchest.to_bag": { ru: "В мешочек", en: "Into a loot bag" },
  "pchest.place_title": { ru: "Куда поставить", en: "Where to place" },
  // Тосты
  "pchest.buried_toast": { ru: "Сундук закопан", en: "The chest is buried" },
  // Отказы сервера
  "pchest.gone": { ru: "Сундука уже нет", en: "The chest is gone" },
  "pchest.buried": { ru: "Сундук закопан", en: "The chest is buried" },
  "pchest.taken": { ru: "Это уже забрали", en: "Someone already took it" },
  "pchest.full": { ru: "В сундуке нет места", en: "The chest is full" },
  "pchest.not_chest": { ru: "Это не сундук", en: "This is not a chest" },
  "pchest.place_far": {
    ru: "Сундук ставят под себя или рядом",
    en: "Place the chest under you or right next to you",
  },
  "pchest.confirm": {
    ru: "В сундуке всё поменялось — проверь цифры",
    en: "The chest has changed — check the numbers",
  },
  "chest.buried": { ru: "Сундук закопан", en: "The chest is buried" },
};
