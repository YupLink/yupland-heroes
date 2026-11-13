// «Что нового» без ручной работы (владелец, 29.10.2026: «да» — собирать само).
// Источник — заголовки изменений игры за 21 день: их раз в 10 минут выгружает
// git на сервере (cron misha) в /opt/golden-drop/.git/news-commits.tsv —
// «секунды<TAB>заголовок» построчно; сервер игры видит этот каталог. Читать
// историю самим нельзя: пачки .git — 285 МБ, это память рабочих процессов.
// DeepSeek раз в день пересказывает их словами игрока; ответ лежит в news_ai
// («upd:<день>») и пересчитывается, только если за день прибавились изменения.
// Ручная запись дня в lib/news/updates.ts главнее — день с ней ИИ не трогает.
import { readFile } from "node:fs/promises";
import { cleanLines, deepseekJson } from "@/server/ai/deepseek";
import { NEWS_UPDATES, updatesSince, type NewsUpdateEntry } from "@/lib/news/updates";
import type { NewsLang, NewsUpdateDay } from "@/lib/news/types";
import { readAi, writeAiBody } from "./news-ai-store";

export type Commit = { t: number; s: string };

/** Файл выгрузки (cron на сервере); нет файла — изменений нет. */
const COMMITS_FILE = ".git/news-commits.tsv";
const FILE_TTL_MS = 5 * 60_000;
let fileCache: { at: number; list: Commit[] } | null = null;

/** «секунды<TAB>заголовок» построчно → список; кривые строки — мимо. */
export function parseCommits(text: string): Commit[] {
  return text.split("\n").flatMap((line) => {
    const tab = line.indexOf("\t");
    const t = Number(line.slice(0, tab));
    const s = line.slice(tab + 1).trim();
    return tab > 0 && Number.isFinite(t) && s ? [{ t, s: s.slice(0, 200) }] : [];
  });
}

/** Изменения игры из выгрузки; кэш 5 минут на процесс. */
export async function liveCommits(): Promise<Commit[]> {
  if (fileCache && Date.now() - fileCache.at < FILE_TTL_MS) return fileCache.list;
  const text = await readFile(`${process.cwd()}/${COMMITS_FILE}`, "utf8").catch(() => "");
  fileCache = { at: Date.now(), list: parseCommits(text) };
  return fileCache.list;
}

/** Заголовки изменений по дням UTC: «YYYY-MM-DD» → строки. */
export function commitsByDay(
  list: Commit[],
  fromDate: string,
  toDate: string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of list) {
    const day = new Date(c.t * 1000).toISOString().slice(0, 10);
    if (day < fromDate || day >= toDate) continue;
    out.set(day, [...(out.get(day) ?? []), c.s]);
  }
  return out;
}

type AiDay = {
  n: number;
  ru: string[];
  en: string[];
  headline: { ru: string; en: string; lead_ru: string; lead_en: string } | null;
};

const SYSTEM = `Ты — редактор новостей браузерной игры YupLand Heroes (герои ходят по карте мира,
рубят лес, добывают камень, ловят рыбу, бьются с монстрами, строят замок, торгуют, захватывают шахты).
Тебе дают заголовки технических изменений игры за один день (часть на русском, часть на английском).
Выбери только то, что УЖЕ ДОСТУПНО И ЗАМЕТНО ИГРОКАМ: новые возможности, правила, здания, предметы,
исправленные ошибки, которые мешали играть.
Обязательно ПРОПУСКАЙ: всё, где сказано «база», «выключено», «не включать», «пока», «подготовка», «prep»,
«только админам», «тестерам», «для пилота»; вход, регистрацию, аккаунты; деньги, платежи, вывод, USDT,
DARAI-выплаты, подписки; админку, тесты, обучение-проходку для тестового аккаунта, оформление кода, сборку,
служебные правки, дизайн-макеты; газету, сводки и новости игры (это внутренняя кухня).
Пиши коротко, просто, по-человечески, без технических слов и без выдумок — только то, что прямо следует
из заголовков. Не больше 5 пунктов, каждый — одно предложение до 120 знаков. Числа из заголовков сохраняй.
Если игрокам нечего показать — пустые списки и headline: null.
Ответ — строго JSON: {"ru":[...],"en":[...],"headline":{"ru":"заголовок до 40 знаков","en":"title up to 40 chars",
"lead_ru":"одно предложение","lead_en":"one sentence"} или null}. Пункты ru и en — одни и те же, в том же порядке.`;

/** После сбоя DeepSeek день не трогаем 10 минут: страница не ждёт ИИ на каждом показе. */
const failedAt = new Map<string, number>();
const RETRY_MS = 10 * 60_000;
/** Дольше этого запрос газеты ИИ не ждёт: что не успело — досчитается в фоне. */
const WAIT_MS = 25_000;

/** Пересказ одного дня: из кэша, а прибавились изменения — заново. */
async function aiDay(day: string, subjects: string[]): Promise<AiDay | null> {
  const key = `upd:${day}`;
  const hit = await readAi<AiDay>(key);
  if (hit?.body && hit.body.n >= subjects.length) return hit.body;
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_MS) return hit?.body ?? null;
  const got = await deepseekJson<Partial<AiDay> & { headline?: AiDay["headline"] }>(
    SYSTEM,
    subjects
      .map((s) => `- ${s}`)
      .join("\n")
      .slice(0, 24_000),
  );
  if (!got) {
    failedAt.set(key, Date.now());
    return hit?.body ?? null;
  }
  const ru = cleanLines(got.ru, 5);
  const en = cleanLines(got.en, 5);
  const h = got.headline;
  const body: AiDay = {
    n: subjects.length,
    ru,
    en: en.length === ru.length ? en : ru,
    headline:
      h && typeof h.ru === "string" && h.ru.trim()
        ? {
            ru: h.ru.trim().slice(0, 60),
            en: String(h.en ?? h.ru)
              .trim()
              .slice(0, 60),
            lead_ru: String(h.lead_ru ?? "")
              .trim()
              .slice(0, 160),
            lead_en: String(h.lead_en ?? h.lead_ru ?? "")
              .trim()
              .slice(0, 160),
          }
        : null,
  };
  await writeAiBody(key, body);
  return body;
}

/**
 * Записи «Что нового» от ИИ за дни [fromDate, toDate) — кроме дней, у которых
 * есть ручная запись (skip). Картинок у ИИ-заголовка нет: её рисует газета.
 */
export async function aiUpdates(
  fromDate: string,
  toDate: string,
  skip: ReadonlySet<string>,
): Promise<NewsUpdateEntry[]> {
  const days = [...commitsByDay(await liveCommits(), fromDate, toDate)].filter(
    ([d]) => !skip.has(d),
  );
  const done = await Promise.all(
    days.map(async ([d, subjects]) => [d, await aiDay(d, subjects)] as const),
  );
  return done.flatMap(([date, a]) =>
    a && a.ru.length
      ? [
          {
            date,
            ru: a.ru,
            en: a.en,
            ...(a.headline && {
              headline: {
                title: { ru: a.headline.ru, en: a.headline.en },
                lead: { ru: a.headline.lead_ru, en: a.headline.lead_en },
              },
            }),
          },
        ]
      : [],
  );
}

/**
 * «Что нового» окна [from, to): ручные записи и пересказ ИИ за остальные дни.
 * Открытое окно (to = null) — по сегодняшний день. Сбой ИИ — только ручные.
 */
export async function mergedUpdates(
  fromIso: string,
  toIso: string | null,
  lang: NewsLang,
): Promise<NewsUpdateDay[]> {
  const fromDate = fromIso.slice(0, 10);
  const toDate = (toIso ?? new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10);
  const manual = new Set(NEWS_UPDATES.map((e) => e.date));
  const ai = await Promise.race([
    aiUpdates(fromDate, toDate, manual).catch(() => [] as NewsUpdateEntry[]),
    new Promise<NewsUpdateEntry[]>((done) => setTimeout(() => done([]), WAIT_MS).unref?.()),
  ]);
  return updatesSince(fromDate, lang, [...NEWS_UPDATES, ...ai], toDate);
}
