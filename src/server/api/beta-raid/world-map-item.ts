// Есть ли у игрока предмет «Карта» (владелец, 05.10.2026; ПРАВИЛА §8.32):
// у ВЫБРАННОГО героя аккаунта в рюкзаке целая штука своего товара с галочкой
// «Карта» (raid_custom_item.is_map, миграция map-01). Предмет не тратится и не
// изнашивается — только читается. Выбранный герой — тот же, что у рюкзака
// (hero-load: аккаунт игрока, selected_at, самый свежий).
//
// Тот же признак у клиента — hasMapIn по стопкам рюкзака (lib/raid/worldMapAccess).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

/** Один SELECT: целая штука товара «Карта» в рюкзаке выбранного героя аккаунта. */
export function mapItemSql(account: string): string {
  return `SELECT EXISTS (
      SELECT 1
        FROM yuplink.raid_hero_backpack b
        JOIN yuplink.raid_custom_item ci ON ci.id = split_part(b.stack_key, ':', 2)
       WHERE b.hero_id = (SELECT h.id FROM yuplink.hero_instance h
                           WHERE h.account_id = ${sqlStr(account)} AND h.selected_at IS NOT NULL
                           ORDER BY h.selected_at DESC LIMIT 1)
         AND b.kind = 'custom' AND b.count >= 1 AND ci.is_map
    ) AS ok;`;
}

/** Сбой чтения — бросок: не смогли проверить — карты не открываем. */
export async function hasMapItem(account: string): Promise<boolean> {
  const rows = (await mcpExec(mapItemSql(account), { wrapJson: true })) as Array<{
    ok: unknown;
  }>;
  const ok = rows?.[0]?.ok;
  return ok === true || ok === "t" || ok === "true";
}
