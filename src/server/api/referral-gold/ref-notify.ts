// Письмо пригласившему после ночного начисления рефки (владелец, 02.11.2026:
// «сообщения в бота — да, точно надо»): сколько золота пришло с покупок друзей
// и до какого числа его можно обменять на DARAI без лимита лицензии. От игрового
// бота с кнопкой в игру, как письма о подарках (gifts-notify). Не бросает:
// золото уже на счёте, молчание телеграма его не отменяет.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { REF_GOLD_SWAP_DAYS } from "@/lib/referralGold";

export type RefGoldNotice = { account: string; gold: number };

/** Разослать письма; ответ — скольким дошло. */
export async function notifyRefGold(list: RefGoldNotice[]): Promise<number> {
  const paid = list.filter((n) => n.gold > 0);
  if (paid.length === 0) return 0;
  const rows = (await mcpExec(
    `SELECT a.id AS account_id,
            COALESCE(a.telegram_id,
              (SELECT u.telegram_id FROM yuplink.users u
                WHERE u.account_id = a.id AND u.telegram_id IS NOT NULL
                ORDER BY u.telegram_id LIMIT 1)) AS telegram_id
       FROM yuplink.accounts a
      WHERE a.id IN (${paid.map((n) => sqlStr(n.account)).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ account_id: string; telegram_id: number | string | null }>;
  const tgOf = new Map(
    (rows ?? [])
      .filter((r) => r.telegram_id != null)
      .map((r) => [r.account_id, Number(r.telegram_id)]),
  );
  const { gameBotSendIfEnabled, gamePlayButton } = await import("../../tgGameBot");
  const { getUserLang } = await import("../../userLang");
  const { tFor } = await import("@/lib/i18n");
  const until = new Date(Date.now() + REF_GOLD_SWAP_DAYS * 86_400_000);
  let sent = 0;
  for (const n of paid) {
    const tg = tgOf.get(n.account);
    if (!tg) continue;
    const lang = await getUserLang(tg).catch(() => "ru" as const);
    const date = until.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    });
    const gold = Math.floor(n.gold).toLocaleString(lang === "en" ? "en-US" : "ru-RU");
    const text = [
      `<b>${tFor(lang, "bot.ref_gold_title", { gold })}</b>`,
      "",
      tFor(lang, "bot.ref_gold_footer", { date }),
    ].join("\n");
    if (
      await gameBotSendIfEnabled(tg, text, gamePlayButton(tFor(lang, "bot.game_play"))).catch(
        () => false,
      )
    )
      sent++;
  }
  return sent;
}
