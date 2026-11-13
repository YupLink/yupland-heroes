// Рассылка взрыва динамита (lib/dynamite) — всем без F5, теми же путями, что у
// разборки шахты, рубки и удара:
//  1) снесённые шахты — живое событие «mine_blast» ВСЕМ на карте (вид — по
//     шаблону Архитектора: лесопилка, каменная, золотая, алмазная; облик и прочие
//     шахты — «other», без анимации) и ТОЛЬКО ПОТОМ дельта,
//     которая снимает постройку (announceDismantle по ключу разборки
//     'dyn:<ключ>:<q>:<r>'; не дошла — дошлёт минутный обход поломок), письмо и
//     тост прежнему хозяину — mine-lost-notify («Шахту разобрали (q, r)»);
//  2) деревья и камни — дельта «декор снят», мешочки — событием «bags» по клетке,
//     и только после дельты — очередь отрастания (§8.19; посаженное — без неё);
//  3) охрана шахт и сундуков — «built» с mine: окна и HP охраны перечитываются;
//  4) поверженные — как после удара (dynamite-kills), награды по топу;
//  5) синий (§8.75а): разрушенная шахта — «mine_blast» и руины, у всех тронутых шахт —
//     «built» с mine и owner (охрана, уровень, хозяин), письмо хозяину разрушенной шахты
//     и шахты с пониженным уровнем — mine-lost-notify. Грибы динамит не трогает;
//  6) синий по кораблям — «ships» всем на карте: обломки без экипажа перечитываются
//     (экипаж уже отнесён домой — dynamite-crew-home);
//  7) красный в воду — всплывшая рыба: мешочки-рыбы событием «bags» по клетке, как
//     мешочки декора.
// Конец — отметка sent_at ключа нажатия: повтор нажатия второй раз не рассылает.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { mineBlastKind } from "@/lib/dynamite";
import type { GrantedReward } from "@/server/api/beta-raid/encounter-rewards";
import { settleKills } from "@/server/api/beta-raid/dynamite/dynamite-kills";
import {
  blastSentSql,
  type BlastBlue,
  type BlastDecor,
  type BlastDetail,
  type BlastMine,
} from "@/server/api/beta-raid/dynamite/dynamite-sql";

const warn = (what: string) => (e: unknown) =>
  console.warn(`[dynamite] ${what}:`, e instanceof Error ? e.message : e);

/** Шахты: взрыв всем, потом дельта разборки (она же «built» с владельцем). */
async function sendMines(mapId: string, mines: readonly BlastMine[]): Promise<void> {
  publishRaid({
    mapId,
    type: "mine_blast",
    cells: mines.map((m) => ({ q: m.q, r: m.r, kind: mineBlastKind(m.building, m.skin) })),
  });
  const { announceDismantle } =
    await import("@/server/api/beta-raid/mine-dismantle/mine-dismantle-announce");
  const { dismantleOpSql } =
    await import("@/server/api/beta-raid/mine-dismantle/mine-dismantle-sql");
  type Row = Parameters<typeof announceDismantle>[0];
  for (const m of mines) {
    const rows = (await mcpExec(dismantleOpSql(m.op), { wrapJson: true }).catch(
      warn("ключ разборки не прочитан"),
    )) as Row[] | null | undefined;
    const row = rows?.[0];
    if (row && !row.sent) await announceDismantle(row).catch(warn("разборка не разослана"));
  }
  void import("@/server/api/beta-raid/mine-lost/mine-lost-notify")
    .then((x) => x.kickMineLostNotify())
    .catch(() => {});
}

/** Мешочки взрыва (декор, рыба): событие «bags» по клетке и сборщик — в путь. */
async function sendBags(
  mapId: string,
  cells: ReadonlyArray<{ q: number; r: number }>,
): Promise<void> {
  for (const x of cells) publishRaid({ mapId, type: "bags", cells: [`${x.q},${x.r}`] });
  if (cells.length === 0) return;
  const { startLootBagSweeper } = await import("@/server/api/beta-raid/loot-bag/bag-sweep");
  startLootBagSweeper();
}

/** Декор: дельта, мешочки, затем отрастание (кроме посаженного игроком). */
async function sendDecor(mapId: string, decor: readonly BlastDecor[]): Promise<void> {
  const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
  await recordMapChange(mapId, {
    patches: decor.map((x) => ({ q: x.q, r: x.r, decorationId: null })),
  }).catch(warn("дельта декора не ушла"));
  await sendBags(
    mapId,
    decor.filter((x) => x.bag),
  );
  const regrow = decor.filter((x) => !x.planted && x.re);
  if (regrow.length === 0) return;
  const { scheduleDecorRespawn } = await import("@/server/api/beta-raid/decor-respawn");
  for (const x of regrow) {
    await scheduleDecorRespawn({ mapId, q: x.q, r: x.r, decorId: x.d, minutes: x.re ?? 0 }).catch(
      warn("отрастание не поставлено"),
    );
  }
}

/** Синий: что стало с шахтами и грибами клетки — всем без F5. */
async function sendBlue(mapId: string, blue: readonly BlastBlue[]): Promise<void> {
  const hit = blue.filter((b) => b.act !== "immune" && b.act !== "dead" && b.act !== "none");
  if (hit.length === 0) return;
  const broken = hit.filter((b) => b.act === "broken");
  if (broken.length > 0) {
    publishRaid({
      mapId,
      type: "mine_blast",
      cells: broken.map((b) => ({ q: b.q, r: b.r, kind: mineBlastKind(b.building, b.skin) })),
    });
  }
  publishRaid({
    mapId,
    type: "built",
    mine: true,
    owner: true,
    cells: hit.map((b) => `${b.q},${b.r}`),
  });
  // Хозяину — письмо и строка «к сбору»: шахта разрушена или ей снизили уровень (§8.71).
  if (hit.some((b) => b.owner && (b.act === "broken" || (b.act === "level" && b.pending > 0)))) {
    void import("@/server/api/beta-raid/mine-lost/mine-lost-notify")
      .then((x) => x.kickMineLostNotify())
      .catch(() => {});
  }
}

/** Разослать взрыв и выдать награды; ответ — добыча бросившего. */
export async function announceBlast(o: {
  mapId: string;
  wallet: string;
  op: string;
  detail: BlastDetail;
}): Promise<GrantedReward[]> {
  const d = o.detail;
  if (d.mines.length > 0) await sendMines(o.mapId, d.mines);
  if (d.blue.length > 0) await sendBlue(o.mapId, d.blue);
  if (d.ships.length > 0) publishRaid({ mapId: o.mapId, type: "ships" });
  if (d.decor.length > 0) await sendDecor(o.mapId, d.decor);
  if (d.fish.length > 0) await sendBags(o.mapId, d.fish);
  if (d.guards.length > 0) {
    publishRaid({
      mapId: o.mapId,
      type: "built",
      mine: true,
      cells: d.guards.map((g) => `${g.q},${g.r}`),
    });
  }
  const rewards = await settleKills({ mapId: o.mapId, wallet: o.wallet, hits: d.hits });
  await mcpExec(blastSentSql(o.op)).catch(warn("ключ не отмечен"));
  return rewards;
}
