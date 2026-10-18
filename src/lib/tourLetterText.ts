// Слова письма о турнирах (tourLetter.ts): числа, даты, склонения и «за что
// очки» по категориям — на двух языках сразу.
//
// Письмо собирается в админке один раз и уходит текстом, а не ключами
// словаря: игрок видит готовые абзацы, админ правит их руками. Поэтому слова
// здесь, а не в translations/* — там подписи интерфейса, а не текст письма.
import type { TourMetric } from "@/lib/tournament/types";

export type LetterLang = "ru" | "en";

/** Русское число слова: 1 турнир, 2 турнира, 5 турниров; дробь — как «2,5 турнира». */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few;
  const d = Math.abs(n) % 10;
  const h = Math.abs(n) % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** Английское число слова: 1 ticket, 2 tickets. */
export const enPlural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// Пробел-разделитель Intl бывает неразрывным (и разным в разных ICU) — в
// письме, которое админ правит руками, обычный пробел надёжнее.
const plain = (n: number, lang: LetterLang, digits: number): string =>
  n
    .toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: digits })
    .replace(/[\u00a0\u202f]/g, " ");

/** Сумма коротко: «27,3 млн», «50 000»; en — «27.3M», «50,000». */
export function letterNum(n: number, lang: LetterLang): string {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9)
    return lang === "ru" ? `${plain(v / 1e9, lang, 1)} млрд` : `${plain(v / 1e9, lang, 1)}B`;
  if (a >= 1e6)
    return lang === "ru" ? `${plain(v / 1e6, lang, 1)} млн` : `${plain(v / 1e6, lang, 1)}M`;
  return plain(v, lang, 2);
}

/** «5 золота», «1 млн лайков», «3 лайка»: после «млн» — всегда родительный множественного. */
export function ruCount(n: number, one: string, few: string, many: string): string {
  const word = Math.abs(n) >= 1e6 ? many : ruPlural(n, one, few, many);
  return `${letterNum(n, "ru")} ${word}`;
}

/** «a, b и c» / «a, b and c». */
export function andList(items: readonly string[], lang: LetterLang): string {
  if (items.length <= 1) return items[0] ?? "";
  const and = lang === "ru" ? " и " : " and ";
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

const WD_RU = [
  "воскресенья",
  "понедельника",
  "вторника",
  "среды",
  "четверга",
  "пятницы",
  "субботы",
];
const WD_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const MON_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const msOf = (iso: string | null | undefined): number | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** «понедельника 5 октября 00:00» / «Monday, October 5, 00:00» — по UTC. */
function utcWhen(ms: number, lang: LetterLang): string {
  const d = new Date(ms);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (lang === "ru")
    return `${WD_RU[d.getUTCDay()]} ${d.getUTCDate()} ${MON_RU[d.getUTCMonth()]} ${hm}`;
  return `${WD_EN[d.getUTCDay()]}, ${MON_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${hm}`;
}

// «Со вторника», «со среды» — иначе не выговорить.
const ruFrom = (ms: number): string => ([2, 3].includes(new Date(ms).getUTCDay()) ? "Со" : "С");

const ruDays = (n: number): string => `${n} ${ruPlural(n, "день", "дня", "дней")}`;
const enDays = (n: number): string => `${n} ${enPlural(n, "day", "days")}`;

/**
 * Срок турнира одним предложением (время — UTC, как в расписании):
 * «С понедельника 5 октября 00:00 до воскресенья 11 октября 23:59 (UTC).»
 * Нет конца — «… (UTC), на 7 дней.»; нет и начала — «На 7 дней.»
 */
export function termText(
  t: { startAt: string | null; endAt: string | null; days: number },
  lang: LetterLang,
): string {
  const start = msOf(t.startAt);
  const end = msOf(t.endAt);
  const days = Math.max(1, Math.round(Number(t.days) || 0));
  if (start == null) return lang === "ru" ? `На ${ruDays(days)}.` : `For ${enDays(days)}.`;
  if (lang === "ru") {
    const from = `${ruFrom(start)} ${utcWhen(start, "ru")}`;
    return end != null
      ? `${from} до ${utcWhen(end, "ru")} (UTC).`
      : `${from} (UTC), на ${ruDays(days)}.`;
  }
  const from = `From ${utcWhen(start, "en")}`;
  return end != null
    ? `${from} to ${utcWhen(end, "en")} (UTC).`
    : `${from} (UTC), for ${enDays(days)}.`;
}

/**
 * За что очки — одной строкой на категорию (ПРАВИЛА §8.27 п. 5, metricSources;
 * слова — как в правилах турнира у кнопки «i», translations/tournament-rules):
 * урон и добивания — монстры и боссы; золото — прибыль с торговли; дерево и
 * камень — добыча; рубка — срубленные деревья; шаги и энергия на шаги; фарм —
 * очко в день за каждую шахту во владении; рыбаки — улов, продажа рыбы (своей
 * и купленной в плюс), выпитые зелья скорости.
 */
export const METRIC_GOAL: Record<TourMetric, Record<LetterLang, string>> = {
  damage: {
    ru: "кто нанесёт больше урона монстрам и боссам",
    en: "who deals the most damage to monsters and bosses",
  },
  boss_kills: {
    ru: "кто добьёт больше монстров и боссов",
    en: "who finishes off the most monsters and bosses",
  },
  gold: { ru: "кто больше заработает на торговле", en: "who earns the most from trading" },
  wood: { ru: "кто добудет больше дерева", en: "who gathers the most wood" },
  stone: { ru: "кто добудет больше камня", en: "who mines the most stone" },
  chop: { ru: "кто срубит больше деревьев", en: "who chops down the most trees" },
  steps: { ru: "кто пройдёт больше шагов", en: "who takes the most steps" },
  step_energy: {
    ru: "кто потратит больше энергии на шаги",
    en: "who spends the most energy on steps",
  },
  farm: {
    ru: "у кого больше шахт — очко в день за каждую",
    en: "who owns the most mines — a point a day per mine",
  },
  fish_catch: { ru: "кто поймает больше рыбы", en: "who catches the most fish" },
  fish_sell: { ru: "кто продаст больше рыбы", en: "who sells the most fish" },
  potion_drink: {
    ru: "кто выпьет больше зелий скорости",
    en: "who drinks the most speed potions",
  },
};

/** Есть ли кириллица: имя турнира админ пишет по-русски — английскому письму оно не годится. */
export const hasCyrillic = (s: string): boolean => /[а-яё]/i.test(s);
