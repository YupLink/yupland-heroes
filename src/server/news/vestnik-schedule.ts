// Выход «Вестника героев» по расписанию (владелец, 29.10.2026): каждый день в
// 10:00 по Москве — газета за вчера в чат игроков, по понедельникам — сводка
// прошлой недели в канал. По кнопке админа — сводка последних 7 дней в канал.
//
// Процессов несколько: проход берёт аренду в settings (как usdt-watch), а сам
// выпуск — отметку (vestnik-marks): кто её взял, тот и шлёт. Тот же выпуск
// дважды не выходит ни по расписанию, ни по кнопке.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { sendTgMessageToAdmins } from "@/server/tg";
import type { NewsLang } from "@/lib/news/types";
import { dueIssues, issueKey, type IssueWindow } from "@/lib/news/vestnikWindow";
import { metaLine } from "./vestnik-copy";
import { renderIssue } from "./vestnik-render";
import { captionOf, chatFor, sendPages, setChat, type SendOutcome } from "./vestnik-publish";
import { claimSql, finishSql, MAX_ATTEMPTS, type MarkState } from "./vestnik-marks";
import { pruneChatSql } from "./news-chat";

const EVERY_MS = 5 * 60_000;

const lease = (key: string, every: string) =>
  `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(key)}, now()::text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE yuplink.settings.value::timestamptz < now() - interval '${every}'
   RETURNING 1 AS ok`;

async function rows(sql: string): Promise<Array<Record<string, unknown>>> {
  const r = (await mcpExec(sql, { wrapJsonCte: true }).catch(() => [])) as unknown[];
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

export type PublishResult =
  | { ok: true; promo: string | null }
  | { ok: false; reason: "no_chat" | "already" | "send_failed" | "unknown" };

/** Нарисовать выпуск с промокодом и отправить; группа переехала — догнать по новому номеру. */
async function send(w: IssueWindow, lang: NewsLang, chatId: number, variant: number) {
  const issue = await renderIssue(w, lang, true, variant);
  const [num, when] = metaLine(w, issue.digest, lang);
  const title = `${lang === "en" ? "Heroes' Herald" : "Вестник героев"} · ${num} · ${when}`;
  const caption = captionOf(title, lang);
  let out: SendOutcome = await sendPages(chatId, issue.pages, caption, lang);
  if (out.status === "rejected" && out.migrateTo) {
    await setChat(w.kind, out.migrateTo);
    out = await sendPages(out.migrateTo, issue.pages, caption, lang);
  }
  return { out, promo: issue.promo };
}

async function alert(text: string): Promise<void> {
  if ((await rows(lease("vestnik_alert", "1 hour"))).length === 0) return;
  await sendTgMessageToAdmins(text).catch(() => {});
}

/** Выпустить, если выпуск ещё не выходил и его никто не шлёт прямо сейчас. */
/** variant — выбранный админом вариант картинки («Сгенерировать заново»); 0 — обычный. */
export async function publishMarked(
  w: IssueWindow,
  lang: NewsLang = "ru",
  variant = 0,
): Promise<PublishResult> {
  const chatId = await chatFor(w.kind);
  if (!chatId) return { ok: false, reason: "no_chat" };
  if ((await rows(claimSql(w))).length === 0) return { ok: false, reason: "already" };
  const res = await send(w, lang, chatId, variant).catch((e: unknown) => {
    console.warn("[vestnik] выпуск не собрался:", e instanceof Error ? e.message : e);
    return { out: { status: "rejected" } as SendOutcome, promo: null };
  });
  const state: MarkState =
    res.out.status === "ok" ? "sent" : res.out.status === "unknown" ? "unknown" : "failed";
  const done = await rows(finishSql(w, state));
  if (state === "sent") return { ok: true, promo: res.promo };
  const key = issueKey(w);
  if (state === "unknown") {
    await alert(
      `⚠️ «Вестник героев» (${key}): Telegram не ответил — проверь чат, повтора не будет.`,
    );
    return { ok: false, reason: "unknown" };
  }
  if (Number(done[0]?.attempts) >= MAX_ATTEMPTS) {
    await alert(`⚠️ «Вестник героев» (${key}) не ушёл после ${MAX_ATTEMPTS} попыток.`);
  }
  return { ok: false, reason: "send_failed" };
}

/** Один проход: выпустить то, что пора. */
export async function vestnikPass(now: number = Date.now()): Promise<void> {
  const due = dueIssues(now);
  if (due.length === 0 || (await rows(lease("vestnik_pass", "4 minutes"))).length === 0) return;
  // Сообщения чата сообщества старше 30 дней — прочь.
  await mcpExec(pruneChatSql()).catch(() => {});
  for (const w of due) await publishMarked(w);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Включить расписание в этом процессе; зовёт отдача карты (map-serve). */
export function startVestnik(): void {
  if (timer || typeof setInterval !== "function") return;
  if (!import.meta.env.SSR) return;
  const run = () =>
    void vestnikPass().catch((e) =>
      console.warn("[vestnik] проход не удался:", e instanceof Error ? e.message : e),
    );
  timer = setInterval(run, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  run();
}
