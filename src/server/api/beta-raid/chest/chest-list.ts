// Сундуки на карте игрока — для слоя поверх клеток (как охрана шахт).
//
// Один запрос по карте: сундуков — десятки против шестнадцати тысяч клеток,
// поэтому едут отдельным словарём, а не колонкой снимка карты. «Свой» считаем
// для каждого смотрящего: свой сундук открывается, у чужого — бой с охраной.
//
// Обычные сундуки (29.09, ПРАВИЛА §8.22) едут тем же запросом отдельным полем
// `plain`: у них нет хозяина, и вкладка до выката, не знающая поля, не примет
// их за чужой магический. Закопанные — ни там, ни там: это бугорок, его видно
// во «втором обзоре» слоя мешочков (bag-read-sql).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { accAccountId } from "@/server/api/currency/move";
import type { ChestMarks } from "@/lib/magicChest";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { myMapId } from "@/server/api/beta-raid/encounter-where";
import { canIgnoreVoid } from "@/server/api/beta-raid/voidGate";
import { voidSql } from "@/server/api/beta-raid/voidCells";

type Row = {
  k: string;
  q: number | string;
  r: number | string;
  owner_account: string | null;
  name: string;
  image: string | null;
};

/** Сундуки одного вида на карте: стоящие, под куполом — только админу. */
const layerSql = (k: string, table: string, owner: string, mapId: string, voidFilter: string) =>
  `SELECT '${k}' AS k, mc.q, mc.r, ${owner} AS owner_account, mc.name, mc.image
     FROM ${table} mc
     LEFT JOIN yuplink.raid_map_cells c
            ON c.map_id = mc.map_id AND c.q = mc.q AND c.r = mc.r
    WHERE mc.map_id = ${sqlStr(mapId)} AND mc.buried_at IS NULL ${voidFilter}`;

export const getMagicChests = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ chests: ChestMarks; plain: ChestMarks }> => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const account = await accAccountId(wallet).catch(() => null);
    // Под куполом игроку не показываем ничего — и сундук тоже: метка выдала
    // бы, что за стеной что-то стоит (как у дверей, gate-tolls.ts).
    const voidFilter = canIgnoreVoid(wallet) ? "" : `AND NOT COALESCE(${voidSql("c")}, false)`;
    const rows = (await mcpExec(
      `${layerSql("m", "yuplink.raid_magic_chest", "mc.owner_account", mapId, voidFilter)}
       UNION ALL
       ${layerSql("p", "yuplink.raid_plain_chest", "NULL::text", mapId, voidFilter)};`,
      { wrapJson: true },
    )) as Row[];
    const chests: ChestMarks = {};
    const plain: ChestMarks = {};
    for (const row of rows ?? []) {
      const mark = { name: row.name, image: row.image ?? null };
      const key = `${Number(row.q)},${Number(row.r)}`;
      if (row.k === "p") plain[key] = { ...mark, mine: false, plain: true };
      else chests[key] = { ...mark, mine: !!account && row.owner_account === account };
    }
    return { chests, plain };
  },
);
