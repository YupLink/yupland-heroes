// Мои грядки одним запросом: что растёт, сколько капает в час и сколько зреет.
//
// Сводки по полям не было вовсе: занятость читалась по одной клетке (окно
// поля) или по всей карте без привязки к игроку (флажки). Для окна «Добыча»
// нужен именно список СВОИХ полей — иначе игрок не знает, где он батрачит.
//
// Долю считаем как поле/работников: `raid_field_settle` делит `yield` поровну
// между теми, у кого стоит герой. Накопленное показываем живым — к тому, что
// уже записано в `accrued`, добавляем текущий незакрытый отрезок.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { parseFieldConfig, type FieldReward } from "@/lib/fieldConfig";

export type HarvestField = {
  /** Карта поля: в «Добыче» поля со всех этажей сразу. */
  mapId: string;
  /** Название ДРУГОГО этажа (не того, где стоит игрок); свой — null. */
  floor?: string | null;
  q: number;
  r: number;
  /** Что растёт: ресурс на счёт или товар в рюкзак/склад. */
  reward: FieldReward;
  /** Моя доля в час (поле / число работников). */
  perHour: number;
  /** Сколько уже созрело у меня на этом поле (целые + дробь). */
  pending: number;
  /** Целые единицы, которые уедут на склад ближайшим сеттлом. */
  ready: number;
  /** Дробный хвост: он ещё зреет и на склад не поедет. */
  growing: number;
  /**
   * Сколько моего этого товара лежит в личных ячейках СКЛАДА ЭТОГО ПОЛЯ —
   * того, куда уезжает его урожай (ближайший в радиусе поля). Раньше здесь была
   * сумма по всем складам карты, и «у меня на складах 114» читалось как
   * остаток у этого поля, а на месте лежало 48 (владелец, 21.09).
   * null — у ресурсных полей (ресурс падает на счёт) и без склада рядом.
   */
  stored: number | null;
  /** Склад, к которому относится stored — чтобы подписать координаты. */
  storedAt: { q: number; r: number } | null;
  /** Кто работает от меня. null — героя сняли, накопленное осталось. */
  heroName: string | null;
  /** Сколько всего работников на поле — чтобы объяснить размер доли. */
  workers: number;
};

type Row = {
  q: number;
  r: number;
  hero_id: string | null;
  hero_name: string | null;
  accrued: number | string;
  since_sec: number | string | null;
  workers: number | string;
  cfg: unknown;
};

/** Мои личные ячейки складов карты: «q,r|ключ стека → сколько лежит». */
async function storedByCellStack(mapId: string, account: string): Promise<Map<string, number>> {
  const rows = (await mcpExec(
    `SELECT q, r, stack_key, sum(count)::numeric AS total
       FROM yuplink.raid_warehouse_slot
      WHERE map_id = ${sqlStr(mapId)} AND scope = 'own'
        AND owner_account = ${sqlStr(account)} AND count > 0
      GROUP BY q, r, stack_key;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number; stack_key: string; total: number | string }>;
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    out.set(`${Number(row.q)},${Number(row.r)}|${String(row.stack_key)}`, Number(row.total) || 0);
  }
  return out;
}

export async function myHarvestFields(mapId: string, account: string): Promise<HarvestField[]> {
  const rows = (await mcpExec(
    `SELECT w.q, w.r, w.hero_id, w.accrued,
            extract(epoch from (now() - w.since)) AS since_sec,
            COALESCE(NULLIF(t.name, ''), 'Герой') AS hero_name,
            c.building_config AS cfg,
            (SELECT count(*) FROM yuplink.raid_field_worker o
              WHERE o.map_id = w.map_id AND o.q = w.q AND o.r = w.r
                AND o.hero_id IS NOT NULL) AS workers
       FROM yuplink.raid_field_worker w
       JOIN yuplink.raid_map_cells c
         ON c.map_id = w.map_id AND c.q = w.q AND c.r = w.r
       LEFT JOIN yuplink.hero_instance h ON h.id = w.hero_id
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE w.map_id = ${sqlStr(mapId)} AND w.account_id = ${sqlStr(account)}
      ORDER BY w.q, w.r;`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];

  if (!rows?.length) return [];
  const { canonRef } = await import("./item-alias");
  const { warehouseCells, nearestOf } = await import("./warehouse-store");
  const { WAREHOUSE_RADIUS } = await import("./field-settle");
  // Склад поля — тот же, что у сеттла (ближайший в радиусе). Склады карты — одним
  // запросом на всё окно: по запросу на грядку выходило 40 мс × 35 грядок (16.10).
  const [stored, warehouses] = await Promise.all([
    storedByCellStack(mapId, account),
    warehouseCells(mapId).catch(() => [] as Array<{ q: number; r: number }>),
  ]);
  const warehouseOf = (q: number, r: number) => nearestOf(warehouses, q, r, WAREHOUSE_RADIUS);

  const out: HarvestField[] = [];
  for (const r of rows ?? []) {
    const cfg = parseFieldConfig(r.cfg);
    if (!cfg) continue;
    const workers = Math.max(1, Number(r.workers) || 0);
    // Доля капает, только пока стоит герой: снял — накопленное осталось, но
    // счётчик встал (ровно так же считает raid_field_settle).
    const perHour = r.hero_id ? cfg.yield / workers : 0;
    const openSec = r.hero_id ? Math.max(0, Number(r.since_sec) || 0) : 0;
    const pending = (Number(r.accrued) || 0) + (openSec / 3600) * perHour;
    // На склад уезжают ЦЕЛЫЕ единицы, дробный хвост остаётся зреть — показываем
    // это раздельно, иначе «зреет 1.33» не отвечает на вопрос «что моё сейчас».
    const ready = Math.floor(pending);
    // Ключ полки канонический: «Помидор» с одного поля и «Помидоры» с другого
    // ложатся в один стек — считаем по тому же ключу, каким кладёт сеттл.
    const canonId =
      cfg.reward.kind === "item"
        ? ((await canonRef("custom", cfg.reward.itemId, cfg.reward.name).catch(() => null)) ??
          cfg.reward.itemId)
        : null;
    const wh = canonId ? warehouseOf(Number(r.q), Number(r.r)) : null;
    out.push({
      mapId,
      q: Number(r.q),
      r: Number(r.r),
      reward: cfg.reward,
      perHour,
      pending,
      ready,
      growing: Math.max(0, pending - ready),
      stored: canonId && wh ? (stored.get(`${wh.q},${wh.r}|custom:${canonId}`) ?? 0) : null,
      storedAt: canonId && wh ? wh : null,
      heroName: r.hero_id ? (r.hero_name ?? "Герой") : null,
      workers: Number(r.workers) || 0,
    });
  }
  return out;
}
