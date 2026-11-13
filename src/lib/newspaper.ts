// Газеты на картах (правила Кай, 31.10.2026, ПРАВИЛА §8.96): общие типы для
// сервера и окна газеты/киоска (UI — Codex) и чистые помощники без базы.
//  · Выпуск размещает редакция, когда газета готова и проверена.
//  · Экземпляр лежит на клетке карты; открыть — герой вплотную.
//  · Прочтение — после загрузки картинки и закрытия; тогда все экземпляры
//    выпуска пропадают у этого игрока. Есть киоск — выпуск сохраняется в нём.
//  · «Прочитать позже» — отдельное действие, не прочтение.

/** Экземпляр на карте глазами игрока (прочитанные выпуски сюда не попадают). */
export type NewspaperSpot = {
  id: string;
  issueId: string;
  q: number;
  r: number;
  /** Игрок отложил выпуск («Прочитать позже»). */
  deferred: boolean;
};

/** Открытый выпуск: что показать в окне и какие кнопки доступны. */
export type NewspaperView = {
  issueId: string;
  /** Дата выпуска, YYYY-MM-DD. */
  date: string;
  title: string | null;
  imageUrl: string;
  editions?: NewspaperEditions | null;
  deferred: boolean;
  read: boolean;
  /** Есть газетный киоск — прочитанное сохранится, перечитывать можно. */
  kiosk: boolean;
  /** Кнопка «Прочитать позже» доступна. */
  canDefer: boolean;
};

/** Неделя киоска: понедельник (YYYY-MM-DD) и выпуски, новые первыми. */
export type KioskWeek = { week: string; issues: NewspaperView[] };

/** Вкладки киоска «Отложенные» и «Прочитанные» — обе по неделям. */
export type KioskNewspapers = { deferred: KioskWeek[]; read: KioskWeek[] };

/** Выпуск глазами редакции. */
export type NewspaperIssueAdmin = {
  id: string;
  date: string;
  title: string | null;
  imageUrl: string;
  editions?: NewspaperEditions | null;
  status: "draft" | "published" | "withdrawn";
  copies: number;
  reads: number;
  createdAt: string;
  publishedAt: string | null;
};

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Понедельник недели (UTC) для даты YYYY-MM-DD; кривая дата — она же. */
export function weekOf(date: string): string {
  if (!DATE_RE.test(date)) return date;
  const t = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return date;
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

/** Выпуски по неделям: недели и выпуски внутри — от новых к старым. */
export function groupByWeek(issues: readonly NewspaperView[]): KioskWeek[] {
  const weeks = new Map<string, NewspaperView[]>();
  const sorted = [...issues].sort((a, b) => b.date.localeCompare(a.date));
  for (const it of sorted) {
    const w = weekOf(it.date);
    const list = weeks.get(w) ?? [];
    list.push(it);
    weeks.set(w, list);
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, list]) => ({ week, issues: list }));
}

/** Хосты картинок выпуска: наш сайт и шлюзы IPFS. Остальное — отказ. */
const IMAGE_HOSTS = [
  /(^|\.)yupland\.io$/,
  /(^|\.)pinata\.cloud$/,
  /(^|\.)mypinata\.cloud$/,
  /^ipfs\.io$/,
];

/** Картинка выпуска: путь нашего сайта («/…») или https с разрешённого хоста. */
export function isNewspaperImageUrl(url: string): boolean {
  if (typeof url !== "string" || url.length > 500) return false;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && IMAGE_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

export const isNewspaperDate = (s: string): boolean =>
  DATE_RE.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00.000Z`));

/**
 * Страница газеты для читалки: WebP ~0,4 МБ вместо PNG ~2,5 МБ (04.11.2026). Загруженный
 * выпуск — через /api/img в полный размер (читают с увеличением), старые из /newspapers —
 * готовый .webp рядом.
 */
export function newspaperPageSrc(url: string): string {
  if (url.startsWith("/uploads/")) return `/api/img?u=${encodeURIComponent(url)}&w=1536&q=85`;
  if (/^\/newspapers\/[\w-]+\.png$/.test(url)) return url.replace(/\.png$/, ".webp");
  return url;
}

/** One issue, two languages; each image contains two adjacent pages. */
export type NewspaperEdition = {title: string; spreadUrls: string[]};
export type NewspaperEditions = {ru: NewspaperEdition; en: NewspaperEdition};
export function newspaperEdition(issue: {title:string|null;imageUrl:string;editions?:NewspaperEditions|null}, lang:string): NewspaperEdition|null {
  if (issue.editions) return issue.editions[lang === 'ru' ? 'ru' : 'en'];
  return lang === 'ru' ? {title:issue.title || 'Вестник героев',spreadUrls:[issue.imageUrl]} : null;
}
export function newspaperPage(edition:NewspaperEdition, page:number) {
  const count=edition.spreadUrls.length*2;
  const index=Math.max(0,Math.min(count-1,page));
  return {count,index,url:edition.spreadUrls[Math.floor(index/2)],half:index%2};
}
