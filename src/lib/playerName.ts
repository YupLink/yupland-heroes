// Имя игрока из профиля (владелец 07.11.2026): так игрок виден другим — в турнирах,
// досках урона, лавках, дуэлях. Не задано — как раньше: @ник Telegram.
//
// Правила: 3–20 знаков; буквы — латиница ИЛИ кириллица (не вперемешку: «Мisha»
// с латинской M выглядел бы как чужое имя), цифры, пробел, «_», «-», «.»; хотя бы
// одна буква; пробелы по краям и двойные убираются. Невидимые и прочие буквы
// (например, корейская «пустая» ㅤ) не проходят. Не похоже на запасную подпись:
// «id12345» и кошелёк «*.near / *.tg». Чужое имя, чужой ник Telegram и чужой
// кошелёк — отказ на сервере (без учёта регистра).
export const NAME_MIN = 3;
export const NAME_MAX = 20;

/** Убрать пробелы по краям и двойные. */
export const normalizeName = (raw: string): string => raw.replace(/\s+/g, " ").trim();

/** Ключ словаря отказа или null. Пустое — «снять имя», это можно. */
export function nameProblem(name: string): string | null {
  if (name === "") return null;
  const n = [...name].length;
  if (n < NAME_MIN) return "pname.short";
  if (n > NAME_MAX) return "pname.long";
  if (!/^[\p{Script=Latin}\p{Script=Cyrillic}0-9 _.-]+$/u.test(name)) return "pname.chars";
  if (!/[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(name)) return "pname.letter";
  if (/\p{Script=Latin}/u.test(name) && /\p{Script=Cyrillic}/u.test(name)) return "pname.mixed";
  if (/^id\d+$/i.test(name) || /\.(near|tg|testnet|eth|sol)$/i.test(name)) return "pname.reserved";
  return null;
}
