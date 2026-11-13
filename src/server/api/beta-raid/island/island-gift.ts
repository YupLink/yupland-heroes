// Герой острова на выбор расы (владелец, 20.10.2026: «герой — сразу на выбор,
// не из сундука»): выбранный обычный герой ложится прямо в героев аккаунта и
// становится основным, если рюкзак нынешнего основного пуст (иначе вещи
// застряли бы у прежнего). Раз на аккаунт: id предмета — от аккаунта. Обычные
// герои (1 ур.) есть не у всех рас — выбор из тех, что заведены в справочнике.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { islandGiftRef } from "@/lib/raid/island/gift";

export type IslandHeroOption = { id: string; name: string; race: string; image: string | null };

/** id предмета героя острова — один на аккаунт: второй выбор не ляжет. */
export const heroItemSql = (account: string) => `'ugi_isle_' || md5(${sqlStr(account)})`;

/** Обычные герои на выбор: по одному на расу (первый по id, если вдруг два). */
export async function islandHeroOptions(): Promise<IslandHeroOption[]> {
  const rows = (await mcpExec(
    `SELECT DISTINCT ON (race) id, name, race, image_url
       FROM yuplink.mystic_item_template
      WHERE kind = 'hero' AND active AND level = 1 AND race IS NOT NULL
      ORDER BY race, id;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; race: string; image_url: string | null }>;
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, race: r.race, image: r.image_url }));
}

/**
 * Расу уже выбрал в меню входа (game_start с героем, 06.11.2026): герой у
 * новичка один — окно выбора на острове ему не показываем.
 */
export const startHeroPickedSql = (account: string) =>
  `EXISTS (SELECT 1 FROM yuplink.game_start s
            WHERE s.account_id = ${sqlStr(account)} AND s.template_id IS NOT NULL)`;

/** Выбирал ли аккаунт героя острова — сейчас, до 20.10 (подарком) или в меню входа. */
export async function islandHeroPicked(account: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT (EXISTS (SELECT 1 FROM yuplink.user_game_item WHERE id = ${heroItemSql(account)})
          OR EXISTS (SELECT 1 FROM yuplink.player_gift
                      WHERE source_ref = ${sqlStr(islandGiftRef(account, "hero"))})
          OR ${startHeroPickedSql(account)}) AS picked;`,
    { wrapJson: true },
  )) as Array<{ picked: boolean }>;
  return rows?.[0]?.picked === true;
}

/**
 * Герой выбранной расы — в героев аккаунта. Второй выбор ничего не добавит:
 * id предмета один на аккаунт, повтор (в т. ч. слепой повтор моста) вернёт ту
 * же строку и доделает «основным», если первый раз не успел.
 */
export async function pickIslandHero(
  wallet: string,
  account: string,
  templateId: string,
): Promise<{ itemId: string | null; alreadyHad: boolean }> {
  const hero = (await islandHeroOptions()).find((o) => o.id === templateId);
  if (!hero) throw new Error("island.hero_unknown");
  const acc = sqlStr(account);
  const rows = (await mcpExec(
    `INSERT INTO yuplink.user_game_item (id, account_id, wallet, template_id, kind, source, obtained_at)
     SELECT ${heroItemSql(account)}, ${acc}, ${sqlStr(wallet)}, ${sqlStr(hero.id)}, 'hero', 'island', now()
      WHERE NOT EXISTS (SELECT 1 FROM yuplink.player_gift
                         WHERE source_ref = ${sqlStr(islandGiftRef(account, "hero"))})
        AND NOT EXISTS (${pickedBeforeResetSql(acc)})
        AND NOT ${startHeroPickedSql(account)}
     ON CONFLICT (id) DO UPDATE SET obtained_at = yuplink.user_game_item.obtained_at
     RETURNING id, (xmax = 0) AS fresh;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string; fresh: boolean | string }>;
  // fresh — строку вставил этот вызов; иначе герой был (повтор, обучение с нуля).
  const fresh = rows?.[0]?.fresh === true || rows?.[0]?.fresh === "t";
  const itemId = rows?.[0]?.id ?? (await ownIslandHero(account)) ?? null;
  if (itemId) await makeMainIfFree(wallet, account, itemId);
  return { itemId, alreadyHad: !fresh };
}

/**
 * Обучение начинали с нуля (island-tutorial-reset), а героя острова к тому
 * времени уже выдавали — повторный выбор только показывает окно: второго героя
 * нет, даже если прежнего сдали в ломбард. Снимок сброса — в истории.
 */
export const pickedBeforeResetSql = (acc: string) =>
  `SELECT 1 FROM yuplink.raid_island_tutorial_reset t
    WHERE t.account_id = ${acc}
      AND (jsonb_typeof(t.snapshot -> 'hero_item') = 'object'
           OR (t.snapshot -> 'island' -> 'done') @> '["hero_pick"]'::jsonb)`;

/** Свой герой острова, если он ещё у аккаунта (повторный выбор после сброса обучения). */
async function ownIslandHero(account: string): Promise<string | undefined> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.user_game_item
      WHERE id = ${heroItemSql(account)} AND account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return rows?.[0]?.id;
}

/** Основным — если ещё не основной и рюкзак нынешнего основного пуст (или его нет). */
async function makeMainIfFree(wallet: string, account: string, itemId: string): Promise<void> {
  const acc = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT (SELECT COALESCE(sum(b.count), 0) FROM yuplink.raid_hero_backpack b
               JOIN yuplink.hero_instance h ON h.id = b.hero_id
              WHERE h.account_id = ${acc} AND h.selected_at IS NOT NULL AND b.count > 0) AS carried,
            EXISTS (SELECT 1 FROM yuplink.hero_instance h
                     WHERE h.item_id = ${sqlStr(itemId)} AND h.selected_at IS NOT NULL) AS done;`,
    { wrapJson: true },
  )) as Array<{ carried: number | string; done: boolean }>;
  if (rows?.[0]?.done === true || Number(rows?.[0]?.carried) > 0) return;
  const { wakeHeroInstance } = await import("../../heroes-wake");
  const heroId = await wakeHeroInstance(wallet, account, itemId);
  const { switchMainSql } = await import("../../heroes-select");
  await mcpExec(switchMainSql(acc, heroId));
  const { invalidateHeroPower } = await import("../hero-power");
  invalidateHeroPower(wallet);
}
