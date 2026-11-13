// Тексты «Вестника героев»: подписи страниц на двух языках и главная новость.
// Ничего не сочиняется: заголовок — из «Что нового» (lib/news/updates.ts,
// поле headline) или из цифр дня, если обновлений не было.
import type { IssueWindow } from "@/lib/news/vestnikWindow";
import { fmtNum, periodLabel, plural } from "@/lib/news/newsText";
import type { NewsDayHeadline, NewsDigest, NewsLang } from "@/lib/news/types";

type Copy = Record<string, { ru: string; en: string }>;

const COPY = {
  daily: { ru: "ежедневный выпуск", en: "daily edition" },
  weekly: { ru: "сводка недели", en: "weekly digest" },
  mainDay: { ru: "Главное за день", en: "Top story of the day" },
  mainWeek: { ru: "Главное за неделю", en: "Top story of the week" },
  numDay: { ru: "День в цифрах", en: "The day in numbers" },
  numWeek: { ru: "Неделя в цифрах", en: "The week in numbers" },
  heroes: { ru: "Герои дня", en: "Heroes of the day" },
  records: { ru: "Рекордсмены", en: "Record holders" },
  more: { ru: "Ещё сегодня", en: "Also today" },
  news: { ru: "Что нового", en: "What's new" },
  talk: { ru: "Что обсуждают", en: "Community talk" },
  rich: { ru: "Богачи · золото", en: "The richest · gold" },
  data: { ru: "Данные игры за", en: "Game data for" },
  players: { ru: "игроки", en: "players" },
  steps: { ru: "шаги", en: "steps" },
  energy: { ru: "энергия потрачена", en: "energy spent" },
  fights: { ru: "бои", en: "fights" },
  wins: { ru: "побед", en: "wins" },
  gathered: { ru: "рубка и добыча", en: "chopping & mining" },
  mines: { ru: "захваты шахт", en: "mine captures" },
  place: { ru: "место", en: "place" },
  gold: { ru: "золота", en: "gold" },
  rowSteps: { ru: "Шаги", en: "Steps" },
  rowFights: { ru: "Бои", en: "Fights" },
  rowGathered: { ru: "Рубка", en: "Chopping" },
  rowMines: { ru: "Шахты", en: "Mines" },
} satisfies Copy;

export type CopyKey = keyof typeof COPY;

export const tr = (key: CopyKey, lang: NewsLang): string => COPY[key][lang];

/** «№ 3 · ежедневный выпуск» и дата/период справа. */
export function metaLine(w: IssueWindow, d: NewsDigest, lang: NewsLang): [string, string] {
  const left = `№ ${w.number} · ${tr(w.kind === "day" ? "daily" : "weekly", lang)}`;
  const year = new Date(d.from).getUTCFullYear();
  return [left, `${periodLabel(d.from, lastDay(d.to), lang)} ${year}`];
}

/** Конец окна не входит: последний день — за миллисекунду до него. */
const lastDay = (toIso: string): string => new Date(Date.parse(toIso) - 1).toISOString();

export const footerText = (d: NewsDigest, lang: NewsLang): string =>
  `${tr("data", lang)} ${periodLabel(d.from, lastDay(d.to), lang)}`;

/** «Чайка (5 Lv)» → «Чайка»: уровень в заголовке лишний. */
export const bareName = (name: string): string => name.replace(/\s*\(\d+\s*Lv\)\s*$/i, "").trim();

type Story = { title: string; lead: string; image: string | null };

/** Истории из цифр окна: шаги — всегда, добыча и рубка — если были. */
function dataStories(d: NewsDigest, lang: NewsLang): Story[] {
  const en = lang === "en";
  const span = d.days > 1 ? (en ? "this week" : "за неделю") : en ? "today" : "за день";
  const n = (v: number) => fmtNum(v, lang);
  const top = d.leaders.steps[0];
  const out: Story[] = [
    {
      title: en
        ? `Heroes walked ${n(d.totals.steps)} steps`
        : `Герои прошли ${n(d.totals.steps)} ${plural(d.totals.steps, "шаг", "шага", "шагов")}`,
      lead: top ? `${en ? "The longest road" : "Дальше всех"} — ${top.name}: ${n(top.value)}.` : "",
      image: top?.portrait ?? null,
    },
  ];
  const mon = d.highlights?.monster;
  if (mon) {
    out.push({
      title: `${en ? "Top prey" : "Главная добыча"} — ${bareName(mon.name)}`,
      lead: `${en ? "Wins" : "Побед"} ${span}: ${n(mon.n)}.`,
      image: mon.image,
    });
  }
  const dec = d.highlights?.decor;
  if (dec) {
    out.push({
      title: `${en ? "Most chopped" : "Больше всего рубили"}: ${bareName(dec.name)}`,
      lead: `${en ? "Times" : "Раз"} ${span}: ${n(dec.n)}.`,
      image: dec.image,
    });
  }
  return out;
}

/**
 * Главная новость выпуска: заголовок самого свежего дня окна, где он есть.
 * Обновлений не было — история из цифр, по очереди по дням: шаги, главная
 * добыча, что больше всего рубили. Картинки — её своя первой, затем остальные
 * события окна (монстр, декор, герой лидера) — каждый день разные.
 */
/** variant — номер «Сгенерировать заново»: 0 — как выйдет по расписанию. */
export function mainStory(d: NewsDigest, lang: NewsLang, variant = 0): NewsDayHeadline {
  const stories = dataStories(d, lang);
  const day = d.updates.find((u) => u.headline);
  if (day?.headline) {
    if (variant <= 0) return day.headline;
    // «Сгенерировать заново»: заголовок тот же, картинка другая — события окна
    // по очереди, потом пейзаж (пустой набор).
    const sets = [day.headline.images, ...stories.flatMap((x) => (x.image ? [[x.image]] : [])), []];
    return { ...day.headline, images: sets[variant % sets.length] };
  }
  const dayNo = Math.floor(Date.parse(d.from) / 86_400_000);
  const base = Number.isFinite(dayNo) ? Math.abs(dayNo) : 0;
  const pick = stories[(base + Math.max(0, variant)) % stories.length];
  const others = stories.map((x) => x.image).filter((img) => img && img !== pick.image);
  const images = [pick.image, ...others].filter((img): img is string => !!img).slice(0, 3);
  return { title: pick.title, lead: pick.lead, images };
}

/** Остальные строки «Что нового» окна, без главной; не больше `max`. */
export function otherNews(d: NewsDigest, main: NewsDayHeadline, max: number): string[] {
  const all = d.updates.flatMap((u) => u.items);
  // По заголовку, а не по ссылке: «заново» отдаёт копию с другой картинкой.
  const day = d.updates.find((u) => u.headline?.title === main.title);
  // Первая строка дня главной новости и есть она — её не повторяем.
  const skip = day ? day.items[0] : null;
  return all.filter((s) => s !== skip).slice(0, max);
}
