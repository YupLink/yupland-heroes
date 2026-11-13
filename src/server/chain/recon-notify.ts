// Письма сверки индексатора — только владельцу (06.11.2026: «Ярославу ничего не нужно
// присылать сводку по индексатору»). Тревога — один раз на расхождение (notified_at); сводка — раз в сутки после
// 06:00 UTC, день застолблён в settings.chain_recon_daily (два процесса — одно письмо).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { ReconIssue, ReconStats } from "./recon";
import { alarmText, dailyText } from "./recon-text";

/** Сводку шлём не раньше этого часа UTC. */
export const DAILY_HOUR_UTC = 6;

async function sendAll(text: string): Promise<void> {
  const { adminChats } = await import("@/server/salesNotify");
  const { tgSendMessage } = await import("@/server/tg");
  const { owner } = await adminChats();
  if (owner) await tgSendMessage(owner, text, { replyMarkup: null });
  else console.warn("[chain-recon] письмо: не найден Telegram владельца");
}

export async function notifyAlarms(
  issues: ReadonlyArray<ReconIssue & { id: string }>,
): Promise<void> {
  if (!issues.length) return;
  try {
    await sendAll(alarmText(issues));
    await mcpExec(
      `UPDATE yuplink.chain_recon_issue SET notified_at = now() WHERE id IN (${issues.map((i) => sqlStr(i.id)).join(", ")});`,
      { wrapJson: false },
    );
  } catch (e) {
    console.warn("[chain-recon] письмо о расхождениях:", e instanceof Error ? e.message : e);
  }
}

/** Застолбить сегодняшний день: true — письмо наше. */
export const claimDaySql = (day: string): string =>
  `INSERT INTO yuplink.settings (key, value) VALUES ('chain_recon_daily', ${sqlStr(day)})
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE yuplink.settings.value IS DISTINCT FROM EXCLUDED.value
   RETURNING value`;

export async function notifyDaily(
  stats: ReconStats,
  open: number,
  now = new Date(),
): Promise<void> {
  if (now.getUTCHours() < DAILY_HOUR_UTC) return;
  try {
    const day = now.toISOString().slice(0, 10);
    const rows = (await mcpExec(claimDaySql(day), { wrapJsonCte: true })) as unknown[] | null;
    if (!rows?.length) return;
    await sendAll(dailyText(stats, open));
  } catch (e) {
    console.warn("[chain-recon] сводка:", e instanceof Error ? e.message : e);
  }
}
