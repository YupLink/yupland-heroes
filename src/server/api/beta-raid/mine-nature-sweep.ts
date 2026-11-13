// Окружение лесопилок и каменоломен (владелец, 25.10.2026, ПРАВИЛА §8.80):
// раз в минуту тем же проходом, что поломки (mine-break-sweep).
//
// Работу делает база — raid_mine_nature_sweep (migrations/minev2-80, -81): у своих
// шахт дерева и камня мира пересчитать деревья (горы) рядом; изменилось —
// прошедшее досчитать по старой ставке с неполным часом, дальше — по новой
// (n/3). Один обход за раз на все процессы (try-лок в базе), второй найдёт ноль.
// Здесь — «Хозяин шахт» за начисленное (как смена режима) и рассылка клеток:
// открытое окно шахты перечитает ставку без F5. Ничьи шахты обход не трогает —
// их окно считает соседей на лету (cellStateSql).
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { bumpAchievement } from "@/server/api/achievements/bump";
import { cellsByMap, creditsByOwner } from "./mine-break-sweep";

/** Шахт за один вызов; больше — следующий вызов в том же проходе. */
const BATCH = 200;
const MAX_ROUNDS = 5;

type NatureRow = {
  map_id: string;
  q: number | string;
  r: number | string;
  owner: string | null;
  amount: number | string | null;
};

export const natureSweepSql = (limit: number): string =>
  `SELECT n.cell_map AS map_id, n.cell_q AS q, n.cell_r AS r,
          n.credited_to AS owner, n.credited AS amount
     FROM yuplink.raid_mine_nature_sweep(${Math.max(1, Math.floor(limit))}) n;`;

/** Один проход: пересчитать окружение, засчитать начисленное, разослать клетки. */
export async function sweepMineNature(): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const rows = ((await mcpExec(natureSweepSql(BATCH), { wrapJson: true })) ?? []) as NatureRow[];
    for (const [mapId, cells] of cellsByMap(rows)) {
      // Хозяин тот же: окна клеток и «Добыча» хозяина (гейт «мои шахты») — без
      // owner/mine, иначе все на карте перечитывали бы флажки и охрану.
      publishRaid({ mapId, type: "built", cells });
    }
    for (const [owner, amount] of creditsByOwner(rows)) {
      bumpAchievement(owner, "minelord", amount);
    }
    total += rows.length;
    if (rows.length < BATCH) break;
  }
  return total;
}
