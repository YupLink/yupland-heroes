// Сводка для новостей готовым текстом: коротко, по-человечески, без воды.
// Один и тот же текст отдаёт /api/news?format=text и показывает вкладка
// «Новости» — его копируют в пост как есть. Нули не печатаем, строки из
// одних нулей пропускаем.
import {
  ACTIVITY_BOARDS,
  WEALTH_BOARDS,
  type NewsBoard,
  type NewsDigest,
  type NewsLang,
  type NewsLeader,
  type NewsTotals,
} from "./types";
import { tourSection } from "./newsTourText";

const MONTHS_RU = [
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
const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Число для поста: до миллиона — целиком с разрядами, дальше — «1,6 млн» / «1.6M». */
export function fmtNum(n: number, lang: NewsLang): string {
  const loc = lang === "ru" ? "ru-RU" : "en-US";
  if (Math.abs(n) >= 1_000_000) {
    const m = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(n / 1_000_000);
    return lang === "ru" ? `${m} млн` : `${m}M`;
  }
  return new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(n);
}

/**
 * Русское число слова: 1 шаг, 2 шага, 5 шагов (11–14 — «шагов»). От миллиона
 * число печатается «1,6 млн» — после «млн» слово всегда «шагов».
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.floor(n));
  if (a >= 1_000_000) return many;
  const d = a % 10;
  const h = a % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** «23–29 октября» / «Oct 23–29»; один день — «29 октября». */
export function periodLabel(fromIso: string, toIso: string, lang: NewsLang): string {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  const [da, db] = [a.getUTCDate(), b.getUTCDate()];
  const [ma, mb] = [a.getUTCMonth(), b.getUTCMonth()];
  const same = da === db && ma === mb;
  if (lang === "en") {
    if (same) return `${MONTHS_EN[mb]} ${db}`;
    return ma === mb
      ? `${MONTHS_EN[ma]} ${da}–${db}`
      : `${MONTHS_EN[ma]} ${da} – ${MONTHS_EN[mb]} ${db}`;
  }
  if (same) return `${db} ${MONTHS_RU[mb]}`;
  return ma === mb
    ? `${da}–${db} ${MONTHS_RU[mb]}`
    : `${da} ${MONTHS_RU[ma]} – ${db} ${MONTHS_RU[mb]}`;
}

const LABELS: Record<NewsBoard, Record<NewsLang, string>> = {
  gold: { ru: "Золото", en: "Gold" },
  diamonds: { ru: "Алмазы", en: "Diamonds" },
  darai: { ru: "DARAI", en: "DARAI" },
  wood: { ru: "Дерево", en: "Wood" },
  stone: { ru: "Камень", en: "Stone" },
  steps: { ru: "Шаги", en: "Steps" },
  energy: { ru: "Энергия", en: "Energy" },
  fights: { ru: "Бои", en: "Fights" },
  gathered: { ru: "Рубка и добыча", en: "Chopping and mining" },
  mines: { ru: "Захваты шахт", en: "Mine captures" },
};

function boardLine(board: NewsBoard, list: NewsLeader[], lang: NewsLang): string | null {
  const top = list.slice(0, 3);
  if (top.length === 0) return null;
  const who = top.map((l) => `${l.name} — ${fmtNum(l.value, lang)}`).join(", ");
  return `${LABELS[board][lang]}: ${who}`;
}

/** Части через запятую, с заглавной и точкой; все нулевые — строки нет. */
function sentence(parts: Array<string | false>, lead = ""): string | null {
  const body = parts.filter(Boolean).join(", ");
  if (!body) return null;
  const s = lead + body;
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

function summaryRu(t: NewsTotals): Array<string | null> {
  const n = (v: number) => fmtNum(v, "ru");
  const w = (v: number, one: string, few: string, many: string) =>
    `${n(v)} ${plural(v, one, few, many)}`;
  return [
    `Играли ${w(t.active, "игрок", "игрока", "игроков")}` +
      (t.newPlayers ? `, новых — ${n(t.newPlayers)}.` : "."),
    sentence([
      t.steps > 0 && `вместе прошли ${w(t.steps, "шаг", "шага", "шагов")}`,
      t.energy > 0 && `потратили ${n(t.energy)} энергии`,
    ]),
    sentence([
      t.fights > 0 && `боёв — ${n(t.fights)}` + (t.wins ? ` (побед — ${n(t.wins)})` : ""),
      t.gathered > 0 && `рубки и добычи — ${n(t.gathered)}`,
      t.mines > 0 && `захватов шахт — ${n(t.mines)}`,
    ]),
    sentence([
      t.planted > 0 && `посажено деревьев — ${n(t.planted)}`,
      t.land > 0 && `уложено клеток земли — ${n(t.land)}`,
      t.dynamite > 0 && `взорвано динамита — ${n(t.dynamite)}`,
    ]),
    sentence(
      [
        t.gold > 0 && `${n(t.gold)} золота`,
        t.diamonds > 0 && w(t.diamonds, "алмаз", "алмаза", "алмазов"),
        t.darai > 0 && `${n(t.darai)} DARAI`,
      ],
      "на руках у игроков: ",
    ),
  ];
}

function summaryEn(t: NewsTotals): Array<string | null> {
  const n = (v: number) => fmtNum(v, "en");
  const w = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
  return [
    `${w(t.active, "player", "players")} played` +
      (t.newPlayers ? `, ${n(t.newPlayers)} of them new.` : "."),
    sentence([
      t.steps > 0 && `together they walked ${w(t.steps, "step", "steps")}`,
      t.energy > 0 && `spent ${n(t.energy)} energy`,
    ]),
    sentence([
      t.fights > 0 && `fights — ${n(t.fights)}` + (t.wins ? ` (wins — ${n(t.wins)})` : ""),
      t.gathered > 0 && `chopping and mining — ${n(t.gathered)}`,
      t.mines > 0 && `mine captures — ${n(t.mines)}`,
    ]),
    sentence([
      t.planted > 0 && `trees planted — ${n(t.planted)}`,
      t.land > 0 && `land cells laid — ${n(t.land)}`,
      t.dynamite > 0 && `dynamite blown — ${n(t.dynamite)}`,
    ]),
    sentence(
      [
        t.gold > 0 && `${n(t.gold)} gold`,
        t.diamonds > 0 && w(t.diamonds, "diamond", "diamonds"),
        t.darai > 0 && `${n(t.darai)} DARAI`,
      ],
      "players hold ",
    ),
  ];
}

export function newsText(d: NewsDigest, lang: NewsLang): string {
  const ru = lang === "ru";
  const summary = (ru ? summaryRu(d.totals) : summaryEn(d.totals)).filter((s): s is string => !!s);
  const out: string[] = [`YupLand · ${periodLabel(d.from, d.to, lang)}`, "", ...summary];
  const lines = (boards: readonly NewsBoard[]) =>
    boards.map((b) => boardLine(b, d.leaders[b] ?? [], lang)).filter((s): s is string => !!s);
  const rich = lines(WEALTH_BOARDS);
  if (rich.length) out.push("", ru ? "🏆 Богачи" : "🏆 The richest", ...rich);
  const best = lines(ACTIVITY_BOARDS);
  if (best.length) out.push("", ru ? "🥇 Рекордсмены" : "🥇 Record holders", ...best);
  out.push(...tourSection(d.tournaments, lang));
  if (d.discussions?.length) {
    out.push(
      "",
      ru ? "💬 Что обсуждают" : "💬 Community talk",
      ...d.discussions.map((s) => `• ${s}`),
    );
  }
  if (d.updates.length) {
    out.push("", ru ? "🆕 Что нового" : "🆕 What's new");
    for (const day of d.updates) {
      const [, m, dd] = day.date.split("-");
      out.push(`${dd}.${m}`, ...day.items.map((s) => `• ${s}`));
    }
  }
  return out.join("\n");
}
