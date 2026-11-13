// Рассылка разобранной шахты (ПРАВИЛА §8.70) — надёжно, как у «Забрать» гриба
// (dmine-announce): дельта клетки уходит через recordMapChange (версия карты,
// журнал, сброс снимка, событие 'map'); не записалась — ключ нажатия остаётся
// без detail.sent, и клетку дошлёт повтор того же нажатия или минутный обход
// поломок (resendDismantles). Записалась — ключ отмечен.
//
// Дельта — пустая клетка, и только если клетка всё ещё пуста (кто-то уже
// поставил своё — та постановка разослала себя сама). Шахта-блок из двух
// клеток — «карта перестроена» целиком: стена второй клетки блока у клиента —
// из снимка (mine-block-sync). Дальше 'built' с owner — окна, флажки, полосы
// службы и «Добыча» у всех, и 'bags' — мешочек на клетке видят соседи.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import {
  dismantledOf,
  dismantleSentSql,
  dismantleUnsentSql,
  type DismantleOpRow,
} from "@/server/api/beta-raid/mine-dismantle/mine-dismantle-sql";

/** Разослать разборку и отметить ключ. true — дельта записана (или не нужна). */
export async function announceDismantle(row: DismantleOpRow): Promise<boolean> {
  const mapId = String(row.map_id);
  const [q, r] = [Number(row.q), Number(row.r)];
  const done = dismantledOf(row.detail);
  const here = !row.building_id;
  let ok = true;
  try {
    if (here) {
      const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
      // edit_seq подняла сама функция базы — второй раз не нужно.
      if (done?.block) await recordMapChange(mapId, { full: true });
      else {
        await recordMapChange(mapId, {
          patches: [{ q, r, buildingId: null, buildingSkinId: null, buildingConfig: null }],
        });
      }
    }
    await mcpExec(dismantleSentSql(row.op));
  } catch (e) {
    ok = false;
    console.warn("[mine-dismantle] рассылка не прошла:", e instanceof Error ? e.message : e);
  }
  const cells = [`${q},${r}`];
  if (here) {
    const { withoutVoid } = await import("@/server/api/beta-raid/voidCells");
    const open = await withoutVoid(mapId, cells).catch(() => [] as string[]);
    publishRaid({ mapId, type: "built", mine: true, owner: true, cells: open });
  }
  if (done?.bag) publishRaid({ mapId, type: "bags", cells });
  return ok;
}

/** Дослать неразосланные разборки (шаг минутного обхода поломок). Сколько дослано. */
export async function resendDismantles(): Promise<number> {
  const rows = ((await mcpExec(dismantleUnsentSql(), { wrapJson: true })) ??
    []) as DismantleOpRow[];
  let n = 0;
  for (const row of rows) if (await announceDismantle(row)) n += 1;
  return n;
}
