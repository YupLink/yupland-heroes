// Герой на острове выбран сразу. Новичок приходит с героем-предметом (стартовый
// набор), но экземпляра у него нет, пока героя не поставят основным, — а
// ставить основным можно только у замка основного мира (heroes-select). Без
// выбранного героя нет рюкзака: доски из сундука падали бы мешочком на землю.
// Поэтому остров сам будит и ставит основным героя, если основного нет.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { freeHeroSql } from "@/server/api/hero-rest";

export async function ensureIslandHero(wallet: string, account: string): Promise<void> {
  const list = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT
       (SELECT id FROM yuplink.hero_instance
         WHERE account_id = ${list} AND selected_at IS NOT NULL LIMIT 1) AS selected,
       (SELECT h.id FROM yuplink.hero_instance h
         WHERE h.account_id = ${list} AND ${freeHeroSql("h")}
         ORDER BY h.level DESC, h.created_at LIMIT 1) AS awake,
       (SELECT u.id FROM yuplink.user_game_item u
         WHERE u.account_id = ${list} AND u.kind = 'hero'
           AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.item_id = u.id)
         ORDER BY u.obtained_at NULLS LAST, u.id LIMIT 1) AS sleeping;`,
    { wrapJson: true },
  )) as Array<{ selected: string | null; awake: string | null; sleeping: string | null }>;
  const r = rows?.[0];
  if (!r || r.selected) return;
  let heroId = r.awake;
  if (!heroId && r.sleeping) {
    const { wakeHeroInstance } = await import("../../heroes-wake");
    heroId = await wakeHeroInstance(wallet, account, r.sleeping);
  }
  if (!heroId) return;
  const { switchMainSql } = await import("../../heroes-select");
  await mcpExec(switchMainSql(list, heroId));
  const { invalidateHeroPower } = await import("../hero-power");
  invalidateHeroPower(wallet);
}
