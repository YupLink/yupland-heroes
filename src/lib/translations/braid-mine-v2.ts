import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Окно шахты v2 (ПРАВИЛА §8.59): режим, запас службы, починка. Отказы
// сервера — отдельно, в braid-mine-v2-err.ts. {cost} в кнопках починки —
// место для значков цены (MineRepairLabel), а не текст.
export const dict: Record<string, Entry> = {
  // Имена режимов (владелец, 21.10.2026): ×1 на 7 дн, ×2 на 3, ×3 на сутки.
  "mine2.mode.base": { ru: "Бережно", en: "Steady" },
  "mine2.mode.mid": { ru: "Усердно", en: "Hard" },
  "mine2.mode.max": { ru: "На износ", en: "Overdrive" },
  "mine2.mode_label": { ru: "Режим шахты", en: "Mine mode" },
  "mine2.mode_term": { ru: "×{mult} · {d} д", en: "×{mult} · {d} d" },
  "mine2.yield_mult": {
    ru: "{std} × {mult} = {n} {res} в час",
    en: "{std} × {mult} = {n} {res} per hour",
  },
  // С погодой (§8.83): {w} — коэффициент «шахты» карты, рядом значок погоды.
  "mine2.yield_mult_weather": {
    ru: "{std} × {mult} × {w} = {n} {res} в час",
    en: "{std} × {mult} × {w} = {n} {res} per hour",
  },
  // Окружение лесопилки / каменоломни (§8.80): n из 6 соседей → n/3 добычи.
  "mine2.nature_trees": {
    ru: "Деревьев рядом: {n} из 6 · {p} %",
    en: "Trees nearby: {n} of 6 · {p}%",
  },
  "mine2.nature_mountains": {
    ru: "Гор рядом: {n} из 6 · {p} %",
    en: "Mountains nearby: {n} of 6 · {p}%",
  },
  "mine2.life": { ru: "Запас {p} %", en: "Life {p}%" },
  "mine2.breaks_in": { ru: "сломается через {left}", en: "breaks in {left}" },
  "mine2.left_dh": { ru: "{d} д {h} ч", en: "{d}d {h}h" },
  "mine2.left_hm": { ru: "{h} ч {m} мин", en: "{h}h {m}m" },
  "mine2.left_ms": { ru: "{m} мин {s} с", en: "{m}m {s}s" },
  "mine2.mode_confirm": {
    ru: "«{mode}»: запас пересчитается — сломается через {left}",
    en: "“{mode}”: life will be recalculated — breaks in {left}",
  },
  "mine2.mode_apply": { ru: "Сменить", en: "Switch" },
  "mine2.mode_toast": { ru: "Режим: {mode}", en: "Mode: {mode}" },
  "mine2.mode_toast_left": {
    ru: "{mode} — сломается через {left}",
    en: "{mode} — breaks in {left}",
  },
  // Строка шахты в «Добыче»: срок до поломки коротко.
  "mine2.left_short": { ru: "ещё {left}", en: "{left} left" },
  "mine2.broken_short": { ru: "сломана", en: "broken" },
  "mine2.repair_for": { ru: "Починить за {cost}", en: "Repair for {cost}" },
  "mine2.broken": { ru: "Шахта сломана", en: "The mine is broken" },
  "mine2.repair_take": { ru: "Починить за {cost} и забрать", en: "Repair for {cost} and claim" },
  "mine2.repaired_toast": { ru: "Шахта починена — запас 100 %", en: "Mine repaired — 100% life" },
  "mine2.taken_toast": { ru: "Шахта починена и теперь твоя", en: "Mine repaired — it's yours now" },
  // Остров новичка (§8.59 п. 11): алмаз — раз в сутки, после 7 дней шахта истощена.
  "mine2.diamonds_per_day": { ru: "{n} алмаз в день", en: "{n} diamond per day" },
  "mine2.per_day": { ru: "{n} в день", en: "{n}/day" },
  "mine2.day_suffix": { ru: "/день", en: "/day" },
  "mine2.exhausts_in": { ru: "истощится через {left}", en: "runs out in {left}" },
  "mine2.spent": { ru: "Шахта истощена", en: "The mine is exhausted" },
  // Разобрать сломанную (§8.70): 100 энергии, 30 % цены заготовки — ресурсы
  // сразу на баланс (с 25.10), товары — мешочком на клетке.
  "mine2.dismantle_btn": { ru: "Разобрать · ⚡{n}", en: "Dismantle · ⚡{n}" },
  "mine2.dismantle_title": { ru: "Разобрать шахту?", en: "Dismantle the mine?" },
  "mine2.dismantle_get": { ru: "На баланс: {cost}", en: "To your balance: {cost}" },
  "mine2.dismantle_get_bag": { ru: "Мешочком: {list}", en: "In a loot bag: {list}" },
  "mine2.dismantled_toast": {
    ru: "Шахта разобрана — мешочек на её месте",
    en: "Mine dismantled — a loot bag is in its place",
  },
  "mine2.dismantled_plain": { ru: "Шахта разобрана", en: "Mine dismantled" },
  "mine2.dismantled_got": {
    ru: "Шахта разобрана. Получено: {what}",
    en: "Mine dismantled. Received: {what}",
  },
  "mine2.dismantled_got_bag": {
    ru: "Шахта разобрана. Получено: {what}. Товары — мешочком на её месте",
    en: "Mine dismantled. Received: {what}. Items are in a loot bag in its place",
  },
};
