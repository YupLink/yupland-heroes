// Прошёл ли друг обучение в игре — условие зачёта новых друзей (владелец,
// 05.11.2026, REF_TUTORIAL_SINCE). Пройдено = остров новичка покинут порталом
// (raid_island.finished_at). Пропуск обучения прохождением не считается.
import { mcpExec } from "./db/mcpClient";
import { sqlStr } from "./api/raid-shared";

/** Кошельки из списка, чей аккаунт прошёл обучение. */
export function tutorialDoneSql(wallets: string[]): string {
  return `SELECT u.wallet FROM yuplink.users u
  JOIN yuplink.raid_island i ON i.account_id = u.account_id
 WHERE u.wallet IN (${wallets.map(sqlStr).join(", ")})
   AND i.finished_at IS NOT NULL`;
}

export async function walletsWithTutorial(wallets: string[]): Promise<Set<string>> {
  if (wallets.length === 0) return new Set();
  const rows = (await mcpExec(tutorialDoneSql(wallets), { wrapJson: true })) as Array<{
    wallet: string;
  }> | null;
  return new Set((rows ?? []).map((r) => r.wallet));
}
