import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: постройка «Забвение» и отказы забвения эффектом. Подписи самого
// эффекта («Забвение 3 Lv», «Забвение на 30 мин») — в braid-boost-fx.ts, рядом
// с иммунитетом: их читает общий текст эффектов (lib/hero/boost.ts).
export const dict: Record<string, Entry> = {
  // ── окно постройки ──
  "oblivion.take": { ru: "Получить забвение", en: "Get oblivion" },
  "oblivion.got": { ru: "Получено: {what}", en: "Received: {what}" },

  // ── отказы сервера (oblivion-temple.ts / oblivion-forget.ts) ──
  "oblivion.not_here": { ru: "Здесь нет забвения", en: "No oblivion here" },
  "oblivion.unbuilt": {
    ru: "Постройка ещё строится",
    en: "The building is still under construction",
  },
  "oblivion.not_set": {
    ru: "Забвение не настроено: цена не задана",
    en: "Oblivion is not set up: no price",
  },
  "oblivion.need": { ru: "Нужен эффект «Забвение»", en: "The Oblivion effect is required" },
  "oblivion.failed": {
    ru: "Эффект не выдан — плата возвращена",
    en: "The effect was not granted — payment refunded",
  },
  // Пара «уровень + минуты» у храма неверна (правило пришло позже настройки).
  "oblivion.bad_setup": { ru: "Забвение настроено с ошибкой", en: "Oblivion is misconfigured" },

  // ── настройка эффекта (редакторы и отказ сервера на сохранение, oblivionRule.ts) ──
  "oblivion.need_time_or_level": {
    ru: "Задай время или количество использований (уровень)",
    en: "Set a duration or a number of uses (level)",
  },
  "oblivion.level_ph": { ru: "0 — без счёта, 1 или 1-3", en: "0 — unlimited, 1 or 1-3" },
  "oblivion.minutes_ph": { ru: "пусто — без срока", en: "empty — no expiry" },
};
