// Что лежит на клетке на земле — глазами админа: сундук и мешочки.
//
// Окно клетки режима бога берёт местность, декор, объект, постройку и корабль
// из карты, а сундуки и мешочки живут своими слоями — у игрока по кругу вокруг
// героя (getMagicChests, getLootBagsNear). Для «Переместить» админу нужен
// состав ЛЮБОЙ клетки — читаем его здесь, по активной карте (как getAdminCell).
// Под декором мешочков и бугорков не видно никому, и админу тоже (§8.19,
// подтверждено владельцем): их здесь нет; стоящий сундук декор не накрывает.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireAdmin } from "@/server/auth";
import { godMapId } from "@/server/api/beta-raid/god-map";
import { atCell } from "@/server/api/beta-raid/god-move/move-where";

/** Сундук клетки: ref для переноса («magic:<хозяин>» / «plain:<id>»), имя, бугорок. */
export type GroundChest = { ref: string; magic: boolean; name: string; buried: boolean };

/** Живые мешочки клетки: id (для переноса) и сколько из них закопано. */
export type GroundBags = { ids: string[]; buried: number };

export type GroundView = { chest: GroundChest | null; bags: GroundBags | null };

type Raw = {
  magic: { owner?: string; name?: string; buried?: boolean } | null;
  plain: { id?: string; name?: string; buried?: boolean } | null;
  bags: Array<{ id?: string; buried?: boolean }> | null;
  decor: boolean | null;
};

/** Ответ базы → состав. Бугорки и мешочки под декором не видны. */
export function parseGround(raw: Raw | undefined): GroundView {
  const covered = raw?.decor === true;
  const m = raw?.magic;
  const p = raw?.plain;
  const chest: GroundChest | null =
    m?.owner && !(covered && m.buried)
      ? { ref: `magic:${m.owner}`, magic: true, name: m.name ?? "", buried: !!m.buried }
      : p?.id && !(covered && p.buried)
        ? { ref: `plain:${p.id}`, magic: false, name: p.name ?? "", buried: !!p.buried }
        : null;
  const list = covered ? [] : (raw?.bags ?? []).filter((b) => !!b.id);
  const bags = list.length
    ? { ids: list.map((b) => String(b.id)), buried: list.filter((b) => b.buried).length }
    : null;
  return { chest, bags };
}

export const getAdminCellGround = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<GroundView> => {
    requireAdmin();
    const mapId = await godMapId();
    const at = (a: string) => atCell(a, mapId, data);
    const rows = (await mcpExec(
      `SELECT
         (SELECT json_build_object('owner', x.owner_account, 'name', x.name,
                                   'buried', x.buried_at IS NOT NULL)
            FROM yuplink.raid_magic_chest x WHERE ${at("x")}) AS magic,
         (SELECT json_build_object('id', x.id, 'name', x.name, 'buried', x.buried_at IS NOT NULL)
            FROM yuplink.raid_plain_chest x WHERE ${at("x")}) AS plain,
         (SELECT json_agg(json_build_object('id', b.id, 'buried', b.buried_at IS NOT NULL)
                          ORDER BY b.id)
            FROM yuplink.raid_loot_bag b
           WHERE ${at("b")}
             AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item li
                          WHERE li.bag_id = b.id AND li.count > 0 AND li.expires_at > now())) AS bags,
         (SELECT c.decoration_id IS NOT NULL FROM yuplink.raid_map_cells c WHERE ${at("c")}) AS decor`,
      { wrapJson: true },
    )) as Raw[];
    return parseGround(rows?.[0]);
  });
