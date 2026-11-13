// Письмо нашедшему клад — игровым ботом @yupland_heroes_bot (владелец 08.11.2026:
// «ему должно писаться в боте хероус, что он нашёл клад»). Язык игрока, кнопка —
// в «Добычу» (?mine=list, castle-live/useMineLink), где приз ждёт «Забрать».
// Кто выключил уведомления — не пишем (gameBotSendIfEnabled). Зовёт tell() один раз.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { prizeText, type TreasurePrize } from "@/lib/treasure";
import { esc } from "./treasure-tg";

type Prize = Pick<TreasurePrize, "resource" | "token" | "amount" | "name"> & { account: string };

/** Telegram аккаунта: из аккаунта, иначе из его кошельков (как письма о шахтах). */
const tgSql = (account: string) => `SELECT COALESCE(a.telegram_id,
    (SELECT u.telegram_id FROM yuplink.users u
      WHERE u.account_id = a.id AND u.telegram_id IS NOT NULL
      ORDER BY u.telegram_id LIMIT 1)) AS tg
   FROM yuplink.accounts a WHERE a.id = ${sqlStr(account)}`;

/** Письмо «Ты нашёл клад!». true — ушло. Не бросает. */
export async function tellFinder(t: Prize): Promise<boolean> {
  const rows = (await mcpExec(tgSql(t.account), { wrapJson: true }).catch(() => [])) as Array<{
    tg: number | string | null;
  }> | null;
  const tg = Number(rows?.[0]?.tg);
  if (!Number.isSafeInteger(tg) || tg <= 0) return false;
  const { gameBotSendIfEnabled, gameLinkButton } = await import("@/server/tgGameBot");
  const { getUserLang } = await import("@/server/userLang");
  const { tFor } = await import("@/lib/i18n");
  const lang = await getUserLang(tg).catch(() => "ru" as const);
  const text = tFor(lang, "treasure.dm_found", { prize: esc(prizeText(t, lang)) });
  const button = gameLinkButton(tFor(lang, "treasure.dm_open"), { mine: "list" });
  return gameBotSendIfEnabled(tg, text, button).catch(() => false);
}
