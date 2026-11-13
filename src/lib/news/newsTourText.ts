// Турниры в тексте сводки (/api/news и вкладка «Новости»): по строке на
// турнир — идёт или скоро, за что очки, срок, призы, запись, лидеры.
// Предложения собраны на сервере (news-tours) — здесь только склейка.
import type { NewsLang, NewsTour, NewsTours } from "./types";

const fmt = (n: number, lang: NewsLang): string =>
  new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(n);

function leadersText(t: NewsTour, lang: NewsLang): string | null {
  if (t.leaders.length === 0) return null;
  const list = t.leaders.map((l) => `${l.place}. ${l.name} — ${fmt(l.score, lang)}`).join(", ");
  return lang === "ru" ? `Лидеры: ${list}.` : `Leaders: ${list}.`;
}

/** Одна строка турнира. */
export function tourLine(t: NewsTour, lang: NewsLang): string {
  const ru = lang === "ru";
  const running = t.status === "running";
  const head = running
    ? ru
      ? `Идёт «${t.name}»`
      : `Now on: “${t.name}”`
    : ru
      ? `Скоро «${t.name}»`
      : `Coming up: “${t.name}”`;
  const players = t.players > 0 && (ru ? `Записались: ${t.players}.` : `Signed up: ${t.players}.`);
  const snap =
    t.snapAt &&
    (ru
      ? `Шахты считаются каждый день в ${t.snapAt} UTC.`
      : `Mines are counted daily at ${t.snapAt} UTC.`);
  return [
    `• ${head}${t.goal ? ` — ${t.goal}` : ""}.`,
    t.term,
    snap,
    t.prizes,
    t.entry,
    players,
    running && leadersText(t, lang),
  ]
    .filter((s): s is string => !!s)
    .join(" ");
}

/** Раздел «Турниры» с пустой строкой впереди; турниров нет — пусто. */
export function tourSection(tours: NewsTours | undefined, lang: NewsLang): string[] {
  const list = [...(tours?.active ?? []), ...(tours?.soon ?? [])];
  if (list.length === 0) return [];
  return [
    "",
    lang === "ru" ? "🏟 Турниры" : "🏟 Tournaments",
    ...list.map((t) => tourLine(t, lang)),
  ];
}
