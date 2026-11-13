// Выпуск «Вестника героев» в картинки: сводка за окно → вёрстка → satori (SVG,
// текст кривыми) → sharp (PNG). Без браузера и без ИИ: текст из данных игры.
// Готовые страницы держим минуту — вкладка, API и публикация рисуют одно и то же.
// Промокод заводится ТОЛЬКО для публикации: превью и /api/news рисуют выпуск
// без кода, иначе владелец ссылки штамповал бы живые коды на любые даты.
import type { NewsDigest, NewsLang } from "@/lib/news/types";
import { issueKey, type IssueWindow } from "@/lib/news/vestnikWindow";
import { buildIssueDigest } from "@/server/api/news/news-digest";
import { vestnikFonts } from "./vestnik-fonts";
import { dayPages, weekPages } from "./vestnik-pages";
import { issuePromo } from "./vestnik-promo";
import { H, W, type El } from "./vestnik-ui";

export type Issue = {
  window: IssueWindow;
  digest: NewsDigest;
  promo: string | null;
  pages: Buffer[];
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; job: Promise<Issue> }>();

async function toPng(el: El): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const sharp = (await import("sharp")).default;
  // satori ждёт ReactNode — наши узлы того же вида { type, props }.
  const svg = await satori(el as unknown as Parameters<typeof satori>[0], {
    width: W,
    height: H,
    fonts: vestnikFonts(),
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function build(
  w: IssueWindow,
  lang: NewsLang,
  withPromo: boolean,
  variant: number,
): Promise<Issue> {
  const [digest, promo] = await Promise.all([
    buildIssueDigest(w.from, w.to, lang),
    withPromo ? issuePromo(issueKey(w)) : Promise.resolve(null),
  ]);
  const els =
    w.kind === "day"
      ? await dayPages(w, digest, lang, promo, variant)
      : await weekPages(w, digest, lang, promo, variant);
  const pages: Buffer[] = [];
  for (const el of els) pages.push(await toPng(el));
  return { window: w, digest, promo, pages };
}

/** Выпуск за окно: страницы PNG, сводка и (для публикации) промокод. Сбой не кэшируется. */
export function renderIssue(
  w: IssueWindow,
  lang: NewsLang,
  withPromo = false,
  variant = 0,
): Promise<Issue> {
  const key = `${issueKey(w)}|${w.to}|${lang}|${withPromo ? "promo" : "plain"}|${variant}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.job;
  for (const [k, v] of cache) if (now - v.at >= TTL_MS) cache.delete(k);
  const job = build(w, lang, withPromo, variant);
  cache.set(key, { at: now, job });
  job.catch(() => cache.delete(key));
  return job;
}
