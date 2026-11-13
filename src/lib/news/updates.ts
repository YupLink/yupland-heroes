// «Что нового» для сводки новостей: по дню — короткие строки словами игрока.
//
// Пополнять при каждом выкате, который заметят игроки: день сверху, строки
// ru и en поровну, без админских и служебных правок. Файл подойдёт к 250
// строкам — старые месяцы уезжают в соседний файл и склеиваются здесь.
//
// headline — главная новость дня для «Вестника героев»: заголовок, одна
// строка пояснения и картинки из игры (путь сайта; «путь@N» — N-й кадр
// 128×128 полосы спрайта). Нет картинок — газета возьмёт пейзаж.
import type { NewsLang, NewsUpdateDay } from "./types";
import { NEWS_UPDATES_2026_10 } from "./updates-2026-10";

type Pair = { ru: string; en: string };
export type NewsHeadline = { title: Pair; lead: Pair; images?: string[] };
export type NewsUpdateEntry = { date: string; ru: string[]; en: string[]; headline?: NewsHeadline };

const H = (title: Pair, lead: Pair, images?: string[]): NewsHeadline => ({ title, lead, images });

export const NEWS_UPDATES: NewsUpdateEntry[] = [
  {
    date: "2026-11-09",
    ru: [
      "Деревья и горы вокруг лесопилок и каменоломен теперь делятся: дерево у двух шахт даёт каждой половину своей прибавки. Местность «Высокогорье» и «Горы» больше не считается горой — только горы, что стоят на клетке.",
      "В «Рефералах» появилась кнопка «Поделиться»: приглашение с готовым текстом уходит другу в Телеграм, а в браузере — через «Поделиться» телефона. Друг увидит, кто его позвал и какой подарок его ждёт.",
      "Владельцы казино получают долю: раз в сутки 5 % прибыли казино делятся поровну на всех героев со способностью «Владелец казино». Доля приходит в «Добычу» — заберите её там.",
      "Способности героев заработали. Рыбак ловит чаще: шанс поимки 10 % вместо 7 %. Шахтёр за 40 энергии ставит на свою шахту замок на 3 часа — её нельзя захватить; ставится лично, у самой шахты.",
    ],
    en: [
      "Trees and mountains around sawmills and quarries are now shared: a tree next to two mines gives each half of its bonus. Highland and Mountains terrain no longer counts as a mountain — only mountains standing on a cell do.",
      "Referrals now have a Share button: the invite with ready text goes to a friend in Telegram, or via your phone's Share in a browser. Your friend sees who invited them and the gift waiting.",
      "Casino owners get a share: once a day 5% of the casino's profit is split equally among all heroes with the Casino owner ability. The share arrives in Harvest — claim it there.",
      "Hero abilities now work. A Fisherman catches more often: 10% catch chance instead of 7%. A Miner can lock their own mine for 3 hours for 40 energy so nobody can seize it; only in person, next to the mine.",
    ],
  },
  {
    date: "2026-11-08",
    ru: [
      "В Мидгарде открыта мини-игра «Корона гречневого королевства» на золото: вход 100, за каждую опущенную корону — 50 золота. Короны и греча копятся — есть рейтинг.",
      "Клад дня теперь зарывается в 09:00 по Москве. Найденный клад ложится в «Добычу» — заберите его там; игровой бот напишет о находке.",
    ],
    en: [
      "The mini-game “Crown of the Buckwheat Kingdom” is open in Midgard for gold: entry 100, each crown brought down pays 50 gold. Crowns and buckwheat add up on the leaderboard.",
      "The treasure of the day is now buried at 09:00 Moscow time. A found treasure goes to Harvest — claim it there; the game bot will message you about the find.",
    ],
  },
  {
    date: "2026-11-07",
    ru: [
      "Клад дня: каждый день в 12:00 по Москве в одном из миров зарыт клад. Он лежит сутки и достаётся первому, кто выкопает его лопатой.",
      "В профиле можно задать своё имя — его видят все в турнирах, досках урона, лавке и дуэлях фишек.",
    ],
    en: [
      "Treasure of the day: every day at 12:00 Moscow time a treasure is buried in one of the worlds. It stays for a day and goes to the first hero who digs it up with a shovel.",
      "Set your own name in the profile — everyone sees it in tournaments, damage boards, the chip shop and chip duels.",
    ],
  },
  ...NEWS_UPDATES_2026_10,
];

/** Дни с `fromDate` до `toDate` (не включая; YYYY-MM-DD), новые сверху, на нужном языке. */
export function updatesSince(
  fromDate: string,
  lang: NewsLang,
  list: NewsUpdateEntry[] = NEWS_UPDATES,
  toDate?: string,
): NewsUpdateDay[] {
  return list
    .filter((e) => e.date >= fromDate && (!toDate || e.date < toDate))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({
      date: e.date,
      items: lang === "en" ? e.en : e.ru,
      ...(e.headline && {
        headline: {
          title: e.headline.title[lang],
          lead: e.headline.lead[lang],
          images: e.headline.images ?? [],
        },
      }),
    }));
}
