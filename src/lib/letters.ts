// Письма на весь экран — общий контракт сервера, окна игрока и админки.
//
// Слово владельца (04.10.2026): при входе в игру игроку приходит «письмо на
// весь экран» (например, «Объявлен новый турнир…»). Кому — всем, списку
// аккаунтов или «только мне» (аккаунт админа — для пробы). Прочитал («Понятно»)
// — больше это письмо не показывается. Таблицы — migrations/letter-01-player-letter.sql,
// английская версия и «показывать до» — letter-02-en-until.sql.
import { humanError } from "@/lib/humanError";
import type { Lang } from "@/lib/store";

/** Кому письмо в базе: всем или списку аккаунтов. */
export type LetterAudience = "all" | "list";
/** Кому — в форме админки: «Только мне» сервер превращает в список из аккаунта админа. */
export type LetterAudienceInput = LetterAudience | "me";

export const LETTER_TITLE_MAX = 120;
export const LETTER_BODY_MAX = 4000;
export const LETTER_IMAGE_MAX = 1000;
export const LETTER_ACCOUNTS_MAX = 500;

/** Письмо в окне игрока. */
export type PlayerLetter = {
  id: string;
  title: string;
  body: string;
  image: string | null;
  /** Английская версия: видна при английском интерфейсе, если заданы обе строки. */
  titleEn: string | null;
  bodyEn: string | null;
};

/** Письмо в админке. */
export type LetterAdminRow = PlayerLetter & {
  audience: LetterAudience;
  accounts: string[];
  active: boolean;
  createdAt: string | null;
  /** Сколько аккаунтов нажали «Понятно». */
  seen: number;
  /** ISO UTC: после этого письмо больше не приходит; null — бессрочно. */
  showUntil: string | null;
};

/** Список писем админки и аккаунт текущего админа — чтобы узнать «Только мне». */
export type LetterAdminList = { me: string; letters: LetterAdminRow[] };

/** Сохранение из админки. */
export type LetterSaveInput = {
  id?: string;
  title: string;
  body: string;
  titleEn?: string | null;
  bodyEn?: string | null;
  image?: string | null;
  audience: LetterAudienceInput;
  accounts: string[];
  /** ISO UTC; null — бессрочно. */
  showUntil?: string | null;
  /** Показать заново тем, кто уже нажал «Понятно» (правка после пробы). */
  again?: boolean;
};

/** Пустая (из пробелов) строка базы — как её отсутствие. */
export const textOrNull = (s: string | null | undefined): string | null => (s?.trim() ? s : null);

/**
 * Заголовок и текст на языке интерфейса. Английская версия — только целиком:
 * без перевода текста лучше весь русский, чем английский заголовок над русским.
 */
export function letterInLang(
  l: Pick<PlayerLetter, "title" | "body" | "titleEn" | "bodyEn">,
  lang: Lang,
): { title: string; body: string } {
  if (lang === "en" && l.titleEn?.trim() && l.bodyEn?.trim())
    return { title: l.titleEn, body: l.bodyEn };
  return { title: l.title, body: l.body };
}

/** Текст абзацами: пустая строка — новый абзац, одиночный перенос остаётся в абзаце. */
export function letterParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/^\n+|\s+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

/** «acc_1, 123456; near.near» → уникальные непустые записи в исходном порядке. */
export function parseAccountList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** «Только мне» — список ровно из аккаунта админа. */
export function isOnlyMe(row: Pick<LetterAdminRow, "audience" | "accounts">, me: string): boolean {
  return row.audience === "list" && row.accounts.length === 1 && row.accounts[0] === me;
}

// С поясом обязательно: «2026-10-11T23:59» без него JS читает как местное время.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const MINUTE = 60_000;

/**
 * «Показывать до»: пусто — бессрочно; иначе дата ISO. nowMs задан — прошлая
 * дата только прежняя (keepUntil): правка старого, уже истёкшего письма не должна
 * падать. Сравнение до минут — поле формы минутное.
 */
export function letterUntilError(
  until: string | null | undefined,
  opts: { nowMs?: number; keepUntil?: string | null } = {},
): string | null {
  if (!until) return null;
  const ms = ISO_RE.test(until) ? Date.parse(until) : NaN;
  if (!Number.isFinite(ms)) return "letter.err.until";
  if (opts.nowMs === undefined || ms > opts.nowMs) return null;
  const kept = Date.parse(opts.keepUntil ?? "");
  return Math.floor(kept / MINUTE) === Math.floor(ms / MINUTE) ? null : "letter.err.until_past";
}

/** Проверка письма перед сохранением: ключ ошибки letter.err.* или null. */
export function letterError(
  d: {
    title: string;
    body: string;
    titleEn?: string | null;
    bodyEn?: string | null;
    image?: string | null;
    audience: string;
    accounts: string[];
    showUntil?: string | null;
  },
  opts: { nowMs?: number; keepUntil?: string | null } = {},
): string | null {
  if (!d.title.trim()) return "letter.err.title";
  if (d.title.trim().length > LETTER_TITLE_MAX) return "letter.err.title_long";
  if (!d.body.trim()) return "letter.err.body";
  if (d.body.length > LETTER_BODY_MAX) return "letter.err.body_long";
  const titleEn = (d.titleEn ?? "").trim();
  if (titleEn.length > LETTER_TITLE_MAX) return "letter.err.title_en_long";
  if ((d.bodyEn ?? "").length > LETTER_BODY_MAX) return "letter.err.body_en_long";
  // Половина перевода молча не покажется (letterInLang) — лучше сказать сразу.
  if (!titleEn !== !(d.bodyEn ?? "").trim()) return "letter.err.en_half";
  const img = (d.image ?? "").trim();
  if (img && (img.length > LETTER_IMAGE_MAX || !/^(https?:\/\/|ipfs:\/\/|\/uploads\/)/i.test(img)))
    return "letter.err.image";
  if (d.audience !== "all" && d.audience !== "list" && d.audience !== "me")
    return "letter.err.audience";
  if (d.audience === "list" && d.accounts.length === 0) return "letter.err.accounts";
  if (d.accounts.length > LETTER_ACCOUNTS_MAX) return "letter.err.accounts_many";
  return letterUntilError(d.showUntil, opts);
}

/** Текст ошибки: letter.err.* — переводом (humanError ключ с двумя точками не узнаёт). */
export function letterErrText(e: unknown, t: (key: string) => string): string {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).trim();
  const key = /^(letter\.[a-z0-9_.]+)(?::(.*))?$/i.exec(raw);
  if (key) {
    const text = t(key[1]);
    if (text !== key[1]) return key[2] ? `${text}: ${key[2]}` : text;
  }
  return humanError(e);
}
