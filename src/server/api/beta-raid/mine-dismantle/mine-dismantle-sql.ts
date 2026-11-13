// SQL разборки шахты (ПРАВИЛА §8.70): вызов функции базы, ключ нажатия и
// порции возврата. Вся запись — yuplink.raid_mine_dismantle
// (migrations/minev2-60-dismantle.sql, minev2-61-dismantle-balance.sql), здесь
// только как её звать и как читать ответ. Чистые функции — без базы, покрыты
// mine-dismantle.test.ts.
import { sqlStr } from "@/server/api/raid-shared";
import { bagResKey, LOOT_BAG_KEEP_HOURS, LOOT_BAG_TTL_HOURS } from "@/lib/lootBag";
import { goodId } from "@/lib/castleArchitectGoods";
import { isMineV2, MINE_V2_RESOURCES, type MineV2Resource } from "@/lib/mineV2";
import type { DismantleRefund } from "@/lib/mineDismantle";

/** Имена ресурсов в порции (журнал; окно берёт имя из словаря). */
const RES_NAME: Record<string, string> = {
  wood: "Дерево",
  stone: "Камень",
  gold: "Золото",
  diamonds: "Алмазы",
};

/** Порция возврата для функции базы: вид, сколько и сколько часов жить в мешочке. */
export type DismantlePortion = {
  k: string;
  kind: "resource" | "custom";
  ref: string;
  name: string;
  image: null;
  n: number;
  h: number;
};

/**
 * Возврат → порции. Ресурс — resource:<вид>: с minev2-61 база кладёт его сразу
 * на счёт (res_move 'mine_dismantle'), не в мешочек; срок h остался ради
 * прежней функции, если код выкатят раньше миграции. Товар — custom:<id> в
 * мешочек на клетке со сроком обычной порции (имя и картинку база возьмёт из
 * справочника).
 */
export function dismantlePortions(refund: DismantleRefund): DismantlePortion[] {
  const out: DismantlePortion[] = [];
  for (const [res, n] of Object.entries(refund.res)) {
    if (!isMineV2(res) || !((n ?? 0) > 0)) continue;
    const name = RES_NAME[res] ?? res;
    out.push({
      k: bagResKey(res),
      kind: "resource",
      ref: res,
      name,
      image: null,
      n: n ?? 0,
      h: LOOT_BAG_KEEP_HOURS,
    });
  }
  for (const g of refund.goods) {
    if (!(g.qty > 0)) continue;
    const ref = goodId(g.key);
    out.push({
      k: g.key,
      kind: "custom",
      ref,
      name: g.name,
      image: null,
      n: g.qty,
      h: LOOT_BAG_TTL_HOURS,
    });
  }
  return out;
}

export function dismantleSql(o: {
  op: string;
  mapId: string;
  q: number;
  r: number;
  account: string;
  energy: number;
  portions: readonly DismantlePortion[];
  name: string;
}): string {
  const energy = Math.max(0, Number(o.energy) || 0);
  return `SELECT yuplink.raid_mine_dismantle(${sqlStr(o.op)}, ${sqlStr(o.mapId)},
            ${Math.trunc(o.q)}, ${Math.trunc(o.r)}, ${sqlStr(o.account)}, ${energy}::numeric,
            ${sqlStr(JSON.stringify(o.portions))}::jsonb, ${sqlStr(o.name)}) AS res;`;
}

/** Начислено на счёт за разборку: ресурс → сколько. */
export type DismantleGot = Partial<Record<MineV2Resource, number>>;

/** Итог разборки (ответ функции и detail ключа нажатия). */
export type Dismantled = {
  was: boolean;
  bag: string | null;
  got: DismantleGot;
  paid: number;
  block: boolean;
  credited: number;
  creditedTo: string | null;
};

/** got из ответа: только ресурсы v2 и положительные числа (до minev2-61 — пусто). */
export function gotOf(raw: unknown): DismantleGot {
  const out: DismantleGot = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const res of MINE_V2_RESOURCES) {
    const n = Number(o[res]);
    if (Number.isFinite(n) && n > 0) out[res] = n;
  }
  return out;
}

/** jsonb ответа (объектом или строкой) → итог; не разобрали — null. */
export function dismantledOf(raw: unknown): Dismantled | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    was: o.was === true,
    bag: typeof o.bag === "string" ? o.bag : null,
    got: gotOf(o.got),
    paid: Number(o.paid) || 0,
    block: o.block === true,
    credited: Number(o.credited) || 0,
    creditedTo: typeof o.credited_to === "string" ? o.credited_to : null,
  };
}

/** Ключ нажатия с клеткой как она есть: пуста ли она ещё и разослана ли разборка. */
export type DismantleOpRow = {
  op: string;
  map_id: string;
  q: number | string;
  r: number | string;
  detail: unknown;
  sent: boolean | null;
  building_id: string | null;
};

const OP_ROW = `SELECT o.op, o.map_id, o.q, o.r, o.detail, (o.detail ? 'sent') AS sent,
            c.building_id
       FROM yuplink.raid_mine_op o
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = o.map_id AND c.q = o.q AND c.r = o.r`;

/** Сколько ждать досылки: свежую разборку рассылает сама ручка. */
export const DISMANTLE_RESEND_AFTER_SEC = 30;

export const dismantleOpSql = (op: string): string =>
  `${OP_ROW}
      WHERE o.op = ${sqlStr(op)} AND o.kind = 'dismantle' LIMIT 1;`;

/** Неразосланные разборки старше полуминуты (не старше двух суток) — старые первыми. */
export const dismantleUnsentSql = (): string =>
  `${OP_ROW}
      WHERE o.kind = 'dismantle' AND NOT (o.detail ? 'sent')
        AND o.created_at < now() - interval '${DISMANTLE_RESEND_AFTER_SEC} seconds'
        AND o.created_at > now() - interval '2 days'
      ORDER BY o.created_at
      LIMIT 100;`;

export const dismantleSentSql = (op: string): string =>
  `UPDATE yuplink.raid_mine_op SET detail = detail || '{"sent": true}'::jsonb
    WHERE op = ${sqlStr(op)} AND kind = 'dismantle';`;

/** Отказ базы → ключ словаря (braid-mine-v2-err.ts); незнакомое — как было. */
export function dismantleErrorKey(msg: string, energy: number): string {
  if (/not_enough_energy/.test(msg)) return `braid.need_energy|${JSON.stringify({ n: energy })}`;
  if (/mine_working/.test(msg)) return "braid.mine_working";
  if (/mine_gone/.test(msg)) return "braid.mine_gone";
  if (/mine_no_dismantle/.test(msg)) return "braid.mine_no_dismantle";
  return msg;
}
