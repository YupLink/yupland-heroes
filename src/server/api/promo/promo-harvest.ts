// Не доехавшее из промокода — в «Добычу» по всем её правилам (владелец,
// 29.10.2026: «если места в рюкзаке нет — в Добычу»).
//
// Своей очереди не заводим: строка ложится в raid_reward тем же
// queueEncounterReward, что улов, срубленный декор и добыча с объектов. Ключ
// строки — от активации и номера строки кода ('rr_' || md5(ключа), повтор —
// ON CONFLICT DO NOTHING): обрыв посреди выдачи и повторный ввод вторую строку
// не кладут. Забирает игрок обычной кнопкой «Забрать» — с её проверкой героя
// и места; не влезло и тогда — строка просто ждёт дальше.
//
// В «Добычу» идёт ТОЛЬКО то, что не доехало по «бытовой» причине — нет
// выбранного героя или места в рюкзаке (isSoftGrantError), а это бывает лишь у
// стопок: своего товара и босса. Сбой выдачи «Добычей» не лечится: строка
// ждёт повторного ввода теми же ключами — иначе выданное до сбоя (пак за
// паком) легло бы ещё раз под другим ключом.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { liveRewardSql } from "@/server/api/raid-reward-live";
import type { RolledLine } from "./promo-sql";

/** Подпись источника в «Добыче»: harvest.source.promo → «Промокод». */
export const PROMO_SOURCE = "promo";

type HarvestRow = { kind: string; amount: number; packId: string | null; key: string };

/** Строке есть место в «Добыче»: товар и босс — стопкой, как их клеймит grantRaidReward. */
export const harvestCarries = (line: RolledLine): boolean =>
  line.kind === "custom" || line.kind === "boss";

/** Строка «Добычи» для строки кода; не стопке — пусто. */
export function harvestRowsOf(line: RolledLine, key: string): HarvestRow[] {
  const n = Math.max(0, Math.floor(line.amount));
  if (n <= 0 || !harvestCarries(line)) return [];
  return [{ kind: line.kind, amount: n, packId: line.ref, key }];
}

/** Положить строку в «Добычу». Бросок — не легла (сбой базы). */
export async function queuePromoHarvest(o: {
  wallet: string;
  account: string;
  line: RolledLine;
  key: string;
}): Promise<void> {
  const rows = harvestRowsOf(o.line, o.key);
  if (rows.length === 0) throw new Error("promo.harvest_unsupported");
  const [{ queueEncounterReward }, { myMapId }] = await Promise.all([
    import("@/server/api/beta-raid/reward-queue"),
    import("@/server/api/beta-raid/encounter-where"),
  ]);
  // Карта — справочно (как у улова): по ней строка числится за миром игрока.
  const mapId = await myMapId(o.wallet).catch(() => PROMO_SOURCE);
  for (const r of rows) {
    await queueEncounterReward({
      account: o.account,
      mapId,
      cycleNo: 0,
      sourceName: PROMO_SOURCE,
      kind: r.kind,
      amount: r.amount,
      packId: r.packId,
      key: r.key,
      // Как подарок: товар из промокода — не «собранное», в сундук не идёт.
      unlabeled: true,
    });
  }
}

/** Строка уже лежит в «Добыче» (прошлый заход успел положить, но не отметить). */
export async function harvestHas(key: string): Promise<boolean> {
  // Срок у строк промокода не ставится (NULL — бессрочные), условие — общее
  // правило всех читателей очереди (raid-reward-live).
  const rows = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.raid_reward
      WHERE id = 'rr_' || md5(${sqlStr(key)}) AND ${liveRewardSql()};`,
    { wrapJson: true },
  )) as Array<{ n: number | string }>;
  return Number(rows?.[0]?.n) > 0;
}
