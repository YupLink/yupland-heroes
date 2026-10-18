// Лёгкий i18n без библиотек.
//
// Использование:
//   const t = useT();
//   <h1>{t("home.title")}</h1>
//   <p>{t("rewards.claim_n", { n: 5 })}</p>
//
// Текущий язык хранится в useAppStore.lang (localStorage-persist).
// Переключение — useAppStore.setLang('en' | 'ru').

import { useAppStore, type Lang } from "./store";
import { dict } from "./translations";

type Params = Record<string, string | number>;

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`
  );
}

function translate(lang: Lang, key: string, params?: Params): string {
  const entry = (dict as Record<string, Record<Lang, string>>)[key];
  if (!entry) return key; // нет ключа — возвращаем сам ключ (видно в UI)
  const text = entry[lang] ?? entry.ru ?? key;
  return format(text, params);
}

/**
 * React-хук. Возвращает функцию t. Подписывается на изменения lang —
 * при смене языка компонент перерендерится автоматически.
 */
export function useT(): (key: string, params?: Params) => string {
  const lang = useAppStore((s) => s.lang);
  return (key: string, params?: Params) => translate(lang, key, params);
}

/** Текущий язык — для локализации значений вне словаря (metaLabel и т.п.). */
export function useLang(): Lang {
  return useAppStore((s) => s.lang);
}

/**
 * Альтернатива для несакомпонентного контекста (например, в server-fn
 * результатах при необходимости передать локализованный текст).
 */
export function tFor(lang: Lang, key: string, params?: Params): string {
  return translate(lang, key, params);
}
