// Обучение острова с нуля (владелец, 26.10.2026: «сделай ей возможность проводить
// эту процедуру самостоятельно» — тестер-дизайнер и админы). Только свой
// аккаунт — он приходит от кошелька сессии, чужого id на входе нет.
//
// Шаги «по факту» читаются с карты острова, поэтому с нуля — только на новом
// острове: прежний сносится как у «Нового острова» (оставленное на нём уходит
// вместе с картой, рюкзак героя остаётся). Перед этим одной командой (одна
// транзакция) — снимок в историю и сброс отметок обучения: приветствие и шаги
// (done), пропуск, «вышел порталом». Вещи, балансы, герои и ачивки не трогаются.
// Ничего не выдаётся повторно: герой острова — раз на аккаунт (island-gift,
// tutorial_reset_at), подарок первого сундука — раз на аккаунт (giftLeft).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { heroItemSql } from "./island-gift";
import { resetIsland, type IslandMoveResult } from "./island-admin";
import { requireNotKept } from "./island-keep";
import { loadIsland } from "./island-row";

/** Оставленное игроком на карте острова — сносится с ней (dropIslandSql): в снимок. */
const LEFT_ON_MAP = [
  "raid_loot_bag",
  "raid_plain_chest",
  "raid_magic_chest",
  "raid_warehouse_slot",
  "beta_raid_ship",
  "raid_mine_state",
  "raid_field_worker",
  "raid_fishing",
] as const;

const rowsJson = (table: string, where: string) =>
  `COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM yuplink.${table} t WHERE ${where}), '[]'::jsonb)`;

/**
 * Снимок и сброс отметок — ОДНА команда: снимок не записался — сброса нет.
 * Строка задания остаётся (карту меняет resetIsland); tutorial_reset_at — метка
 * «начато заново» для выбора героя.
 */
export function tutorialResetSql(account: string, wallet: string): string {
  const acc = sqlStr(account);
  const map = `(SELECT map_id FROM yuplink.raid_island WHERE account_id = ${acc})`;
  const left = [
    ...LEFT_ON_MAP.map((t) => `${sqlStr(t)}, ${rowsJson(t, `t.map_id = ${map}`)}`),
    `'raid_loot_bag_item', ${rowsJson(
      "raid_loot_bag_item",
      `t.bag_id IN (SELECT id FROM yuplink.raid_loot_bag WHERE map_id = ${map})`,
    )}`,
    `'raid_plain_chest_slot', ${rowsJson(
      "raid_plain_chest_slot",
      `t.chest_id IN (SELECT id FROM yuplink.raid_plain_chest WHERE map_id = ${map})`,
    )}`,
  ];
  return `WITH snap AS (
      INSERT INTO yuplink.raid_island_tutorial_reset (account_id, by_wallet, snapshot)
      SELECT ${acc}, ${sqlStr(wallet)}, jsonb_build_object(
        'island', (SELECT to_jsonb(i) FROM yuplink.raid_island i WHERE i.account_id = ${acc}),
        'hero_item', (SELECT to_jsonb(u) FROM yuplink.user_game_item u
                       WHERE u.id = ${heroItemSql(account)}),
        'left_on_island', jsonb_build_object(${left.join(",\n          ")}))
      RETURNING id)
    UPDATE yuplink.raid_island
       SET done = '[]'::jsonb, tutorial_skipped_at = NULL, finished_at = NULL,
           tutorial_reset_at = now()
     WHERE account_id = ${acc} AND EXISTS (SELECT 1 FROM snap);`;
}

/**
 * С нуля: снимок + отметки, затем новый остров (уйти, снести прежний, войти).
 * Повтор безвреден: ещё один снимок и ещё один новый остров, выдач нет.
 */
export async function restartIslandTutorial(
  wallet: string,
  account: string,
): Promise<IslandMoveResult> {
  // Сохранённый остров — отказ ДО сброса отметок обучения.
  await requireNotKept((await loadIsland(account))?.mapId ?? null);
  await mcpExec(tutorialResetSql(account, wallet));
  return resetIsland(wallet, account);
}
