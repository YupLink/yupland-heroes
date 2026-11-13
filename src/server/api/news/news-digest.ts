// Сборка сводки для новостей: два запроса (цифры и лидеры) + герои лидеров +
// список обновлений. Кэш 30 с на (окно, язык) — /api/news могут дёргать ботом.
// Окно «до сейчас» (API, вкладка) — без конца; выпуск газеты — сутки или
// неделя целиком.
import { mcpExec } from "@/server/db/mcpClient";
import { cacheKey, memo } from "@/server/api/beta-raid/econ/cache";
import {
  ACTIVITY_BOARDS,
  WEALTH_BOARDS,
  type NewsBoard,
  type NewsDigest,
  type NewsHighlight,
  type NewsLang,
  type NewsLeader,
  type NewsTotals,
} from "@/lib/news/types";
import {
  heroesSql,
  highlightsSql,
  leadersSql,
  totalsSql,
  windowStart,
  type AdminLists,
} from "./news-sql";
import { heroLabels, type NewsHero } from "./news-heroes";
import { mergedUpdates } from "@/server/news/news-ai-updates";
import { newsTours } from "./news-tours";

/** Сколько лидеров на доску отдаём наружу (в тексте — первые три). */
export const NEWS_TOP = 10;
/** Скольким богачам по золоту газета ставит портрет героя. */
const PORTRAITS = 3;

type TotalsRow = Record<string, string | number | null>;
type LeaderRow = { board: string; account_id: string; v: string | number };

type AdminEnv = { ADMIN_WALLETS?: string; ADMIN_TG_ACCOUNTS?: string };

/**
 * Админы — те же списки, что у входа в админку (auth.ts): их цифры не новости.
 * Читать только буквально `process.env.X`: сборка подставляет значения из
 * .env именно в такие места (vite define), в контейнере этих переменных нет.
 */
export function adminLists(
  env: AdminEnv = {
    ADMIN_WALLETS: process.env.ADMIN_WALLETS,
    ADMIN_TG_ACCOUNTS: process.env.ADMIN_TG_ACCOUNTS,
  },
): AdminLists {
  const wallets = (env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tgIds = (env.ADMIN_TG_ACCOUNTS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return { wallets, tgIds };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

export function parseTotals(row: TotalsRow | undefined): NewsTotals {
  const r = row ?? {};
  return {
    active: num(r.active),
    newPlayers: num(r.new_players),
    steps: num(r.steps),
    energy: num(r.energy),
    fights: num(r.fights),
    wins: num(r.wins),
    gathered: num(r.gathered),
    mines: num(r.mines),
    planted: num(r.planted),
    land: num(r.land),
    dynamite: num(r.dynamite),
    gold: num(r.gold),
    diamonds: num(r.diamonds),
    darai: num(r.darai),
  };
}

const BOARDS: readonly NewsBoard[] = [...WEALTH_BOARDS, ...ACTIVITY_BOARDS];

/**
 * Строки лидеров → доски с подписями героев (ники не раскрываем); неизвестная
 * доска отбрасывается. Портрет — первым богачам и первому по шагам.
 */
export function groupLeaders(
  rows: LeaderRow[],
  heroes: Map<string, NewsHero>,
  lang: NewsLang,
): Record<NewsBoard, NewsLeader[]> {
  const out = Object.fromEntries(BOARDS.map((b) => [b, [] as NewsLeader[]])) as Record<
    NewsBoard,
    NewsLeader[]
  >;
  const labels = heroLabels(rows, heroes, lang);
  for (const r of rows) {
    const list = out[r.board as NewsBoard];
    if (!list) continue;
    const face =
      (r.board === "gold" && list.length < PORTRAITS) || (r.board === "steps" && list.length === 0);
    const portrait = face ? heroes.get(r.account_id)?.image : null;
    list.push({
      name: labels.get(r.account_id) ?? "",
      value: num(r.v),
      ...(portrait && { portrait }),
    });
  }
  return out;
}

type HighlightRow = { kind: string; name: string | null; image: string | null; n: string | number };

/** Строки событий → { monster, decor }; без имени или с нулём — нет события. */
export function parseHighlights(rows: HighlightRow[]): NewsDigest["highlights"] {
  const out: { monster?: NewsHighlight; decor?: NewsHighlight } = {};
  for (const r of rows) {
    const n = num(r.n);
    if (!r.name || n <= 0 || (r.kind !== "monster" && r.kind !== "decor")) continue;
    out[r.kind] = { name: r.name, image: r.image || null, n };
  }
  return out;
}

/** Герой каждого лидера (имя и лицо); сбой — все «Безымянные». */
async function heroesOf(rows: LeaderRow[]): Promise<Map<string, NewsHero>> {
  const ids = [...new Set(rows.map((r) => r.account_id))];
  if (ids.length === 0) return new Map();
  const got = (await mcpExec(heroesSql(ids), { wrapJson: true }).catch(() => [])) as Array<{
    account_id: string;
    name: string;
    image: string | null;
  }>;
  return new Map((got ?? []).map((g) => [g.account_id, { name: g.name, image: g.image || null }]));
}

async function loadDigest(
  from: string,
  to: string | null,
  lang: NewsLang,
  days: number,
): Promise<NewsDigest> {
  const adm = adminLists();
  const [totals, leaders, events] = await Promise.all([
    mcpExec(totalsSql(from, to, adm), { wrapJson: true }) as Promise<TotalsRow[]>,
    mcpExec(leadersSql(from, to, adm, NEWS_TOP), { wrapJson: true }) as Promise<LeaderRow[]>,
    (mcpExec(highlightsSql(from, to, adm), { wrapJson: true }) as Promise<HighlightRow[]>).catch(
      () => [] as HighlightRow[],
    ),
  ]);
  const rows = leaders ?? [];
  // «Что нового» (ручное + ИИ). Пересказа чата ИИ больше нет (08.11.2026): сами
  // сообщения API отдаёт как есть (news-chat.chatMessages).
  const end = to ?? new Date().toISOString();
  const [heroes, updates] = await Promise.all([heroesOf(rows), mergedUpdates(from, to, lang)]);
  return {
    days,
    from,
    to: end,
    totals: parseTotals(totals?.[0]),
    leaders: groupLeaders(rows, heroes, lang),
    updates,
    highlights: parseHighlights(events ?? []),
  };
}

/**
 * Сводка «последние N дней до сейчас» — API и вкладка «Новости». С турнирами
 * сейчас (идущие и ближайшие); сбой турниров сводку не роняет.
 */
export function buildNewsDigest(days: number, lang: NewsLang): Promise<NewsDigest> {
  const from = windowStart(days);
  return memo(cacheKey("news", { from, lang }), async () => {
    const [digest, tournaments] = await Promise.all([
      loadDigest(from, null, lang, days),
      newsTours(lang).catch(() => undefined),
    ]);
    return tournaments ? { ...digest, tournaments } : digest;
  });
}

/** Сводка за закрытое окно выпуска газеты: [from, to). */
export function buildIssueDigest(from: string, to: string, lang: NewsLang): Promise<NewsDigest> {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
  return memo(cacheKey("news-issue", { from, to, lang }), () => loadDigest(from, to, lang, days));
}
