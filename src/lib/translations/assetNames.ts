// Локализация ИМЁН объектов/террейна/декора/боссов карты рейда.
//
// Имена лежат в БД по-русски и кодом не переводились: EN-игрок видел «Океан»,
// «Замок», «Паки - Рынок». БД не трогаем — переводим на клиенте по языку
// игрока с честным fallback на русский.
//
// Порядок: точное имя целиком (ASSET_NAME_EN) → пословный перевод составного
// имени (ASSET_WORD_EN) → исходное русское имя, если перевести нечего.
import type { Lang } from "../store";
import { ASSET_NAME_EN } from "./assetNames-data";
import { ASSET_WORD_EN_A } from "./assetNames-words";
import { ASSET_WORD_EN_B } from "./assetNames-words-b";

export { ASSET_NAME_EN } from "./assetNames-data";

/** Полный пословный словарь: террейн/постройки + существа/ресурсы/связки. */
export const ASSET_WORD_EN: Record<string, string> = {
  ...ASSET_WORD_EN_A,
  ...ASSET_WORD_EN_B,
};

/** Слово ли это (буквы), а не разделитель/число/скобка. */
const isWord = (s: string): boolean => /\p{L}/u.test(s);

/** С заглавной ли начинается слово — по ней решаем регистр перевода. */
const startsUpper = (s: string): boolean => {
  const c = s[0];
  return !!c && c === c.toUpperCase() && c !== c.toLowerCase();
};

/** «Market» → «market», сохраняя регистр остального. */
const toLowerFirst = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Английское имя объекта/террейна/декора/босса карты.
 * Для не-английского языка (ru) и пустого имени возвращает имя как есть.
 */
export function localizeAssetName(name: string | null | undefined, lang: Lang): string {
  if (!name) return "";
  if (lang !== "en") return name;

  const exact = ASSET_NAME_EN[name];
  if (exact) return exact;

  // Пословный fallback: режем на слова и разделители, разделители и числа
  // («(2)», «10 Lv») оставляем на месте, известные слова переводим.
  const parts = name.split(/(\P{L}+)/u);
  let changed = false;
  const out = parts.map((part) => {
    if (!isWord(part)) return part; // пробелы, «-», скобки, цифры — как есть
    const hit = ASSET_WORD_EN[part.toLowerCase()];
    if (!hit) return part; // неизвестное слово оставляем как в оригинале
    changed = true;
    return startsUpper(part) ? hit : toLowerFirst(hit);
  });

  // Ни одного знакомого слова — честно отдаём русский оригинал.
  return changed ? out.join("") : name;
}
