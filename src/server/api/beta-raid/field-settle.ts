// Ежечасный урожай полей уходит на ближайший склад САМ — ручного сбора нет.
//
// Крона в проекте нет (ПРАВИЛА §8.5), поэтому сеттл ленивый: его дёргают при
// открытии окна поля (getFieldState) и при открытии склада (getWarehouse), где
// урожай, собственно, и оседает. Вынесено из field.ts — тот у потолка 250 строк.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { hexDistance } from "./helpers";
import { parseFieldConfig } from "@/lib/fieldConfig";
import type { FieldConfig } from "@/lib/fieldConfig";
import { nearestWarehouse, creditItemToWarehouse } from "./warehouse-store";

/** Радиус (гекс), в котором поле «видит» склад и льёт в него урожай. */
export const WAREHOUSE_RADIUS = 3;

/**
 * Закрыть накопленное поля и разложить: товар — на ближайший склад в радиусе 3
 * (сначала личные ячейки того аккаунта, что накопил, остаток — в общие), ресурс —
 * на счёт аккаунта (складу не подходит, там товары-стеки). Склада рядом нет или
 * он полон — единицы возвращаются на поле и ждут, урожай не теряется.
 */
export async function settleFieldPayout(
  mapId: string,
  q: number,
  r: number,
  cfg: FieldConfig,
): Promise<void> {
  // Закрываем отрезки — accrued станет свежим у всех работников разом.
  await mcpExec(`SELECT yuplink.raid_field_settle(${sqlStr(mapId)}, ${q}, ${r});`).catch(() => {});
  // ВСЕ аккаунты с накопленным (в т.ч. снявшие героя: hero_id NULL, а урожай их).
  const rows = (await mcpExec(
    `SELECT account_id, wallet FROM yuplink.raid_field_worker
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ account_id: string; wallet: string | null }>;
  if (!rows?.length) return;

  const isItem = cfg.reward.kind === "item";
  // Товару И РЕСУРСУ нужен склад рядом: раньше ресурс сваливался прямо на
  // счёт и «терялся» в общей куче — игрок не мог понять, где его личный
  // урожай. Теперь он оседает в личных ячейках склада точно так же, как
  // яблоки: видно, у кого сколько лежит; заберёт — уйдёт на счёт кнопкой.
  const wh = await nearestWarehouse(mapId, q, r, WAREHOUSE_RADIUS);
  if (!wh) return;

  for (const row of rows) {
    const acc = row.account_id;
    // Забираем ЦЕЛЫЕ единицы этого аккаунта (дробный остаток копится дальше).
    // op-ключ идемпотентности: мост ретраит запрос вслепую — повтор вернёт ТО ЖЕ
    // число и второй раз accrued не спишет (иначе урожай терялся молча).
    const took = (await mcpExec(
      `SELECT yuplink.raid_field_take(${sqlStr(mapId)}, ${q}, ${r}, ${sqlStr(acc)},
              ${sqlStr(`ft:${nanoid(12)}`)}) AS units;`,
      { wrapJsonCte: true },
    ).catch(() => [])) as Array<{ units: number }>;
    const units = Math.floor(Number(took?.[0]?.units) || 0);
    if (units <= 0) continue;

    // Возврат на поле тоже идемпотентен по своему op — иначе слепой повтор
    // прибавил бы единицы дважды (печать урожая из воздуха).
    //
    // Возвращается ТОЛЬКО не записанное из-за сбоя. Что не влезло по тесноте —
    // сгорает: раньше излишек шёл обратно в accrued, поле копило его без
    // предела, и при полных полках игрок «собирал ~600 бананов вместо
    // положенного максимума», забирая частями (владелец 21.09: переполнения
    // недопустимы — склад полон, поле стоит).
    const burned = (n: number, who: string, what: string) => {
      if (n > 0)
        console.log(`[field] склад ${wh.q},${wh.r} полон — сгорело ${n} «${what}» у ${who}`);
    };
    const giveBack = (n: number) =>
      n > 0
        ? mcpExec(
            `SELECT yuplink.raid_field_give_back(${sqlStr(mapId)}, ${q}, ${r}, ${sqlStr(acc)},
                    ${n}, ${sqlStr(`fb:${nanoid(12)}`)});`,
          ).catch(() => {})
        : Promise.resolve();

    if (isItem && cfg.reward.kind === "item" && wh) {
      // creditItemToWarehouse НЕ бросает: сколько не легло — то и вернём на поле,
      // ровно непринятое (без задвоения частично осевшего товара).
      // Ключ склада — канонический: урожай «Помидор» с одного поля и
      // «Помидоры» с другого обязаны лечь в один слот (item-alias).
      const { canonRef } = await import("./item-alias");
      const canonId =
        (await canonRef("custom", cfg.reward.itemId, cfg.reward.name)) ?? cfg.reward.itemId;
      const snap = {
        kind: "custom",
        refId: canonId,
        name: cfg.reward.name,
        image: cfg.reward.image,
      };
      const plan = await creditItemToWarehouse({
        mapId,
        at: wh,
        account: acc,
        stackKey: `custom:${canonId}`,
        snap,
        units,
        // Клетка грядки в op — след раскладки в журнале сделок (ПРАВИЛА §8.13);
        // турнир с 14.10.2026 её не читает: урожай своей грядки — своё всегда.
        op: `fw:${q},${r}:${nanoid(12)}`,
        // Метка происхождения: урожай грядки (stack-origin) — собранное, в сундук
        // годится; метку получает только личная полка (общая — ничья).
        origin: "field",
      });
      await giveBack(plan.failed);
      burned(plan.rejected, acc, cfg.reward.name);
    } else if (!isItem && cfg.reward.kind === "resource" && wh) {
      // Ресурс — на СКЛАД, а не на счёт. Ключ стека резервируется под ресурс
      // так же, как под предмет: клиент по префиксу `resource:` рисует
      // иконку ресурса и предлагает «Забрать → на счёт» вместо «в рюкзак».
      const resKey =
        cfg.reward.resource === "token" && cfg.reward.token
          ? `resource:token:${cfg.reward.token}`
          : `resource:${cfg.reward.resource}`;
      const snap = {
        kind: "resource" as const,
        refId:
          cfg.reward.resource === "token" ? (cfg.reward.token ?? "token") : cfg.reward.resource,
        // Клиент подписывает по refId словарём (marketResourceIconSrc + label);
        // «Золото» здесь — фолбэк, если UI словарём не пользуется.
        name: cfg.reward.resource === "token" ? (cfg.reward.token ?? "Токен") : "Ресурс",
        image: null,
      };
      const plan = await creditItemToWarehouse({
        mapId,
        at: wh,
        account: acc,
        stackKey: resKey,
        snap,
        units,
        op: `fr:${nanoid(12)}`,
        origin: "field",
      });
      await giveBack(plan.failed);
      burned(plan.rejected, acc, resKey);
    }
  }
}

/** «Зреет»: дробный урожай игрока по полю у склада (stackKey — как у ячейки). */
export type FieldPending = { stackKey: string; name: string; image: string | null; amount: number };

/**
 * Сеттл всех полей в радиусе склада: их урожай оседает именно тут, так что
 * открыл склад — увидел свежие полки. Товары И ресурсы: теперь ресурс тоже
 * идёт на склад ячейкой, а игрок кнопкой переводит его на счёт.
 *
 * Возвращает «зреет» — дробный остаток ИГРОКА (< 1, целые уже упали в ячейки) по
 * тем полям, что кормят ИМЕННО этот склад. Точность 0.01, чтобы игрок видел, что
 * урожай идёт, даже пока целого товара ещё нет. Сбор — всё равно только целыми.
 */
export async function settleFieldsForWarehouse(
  mapId: string,
  wq: number,
  wr: number,
  account: string,
): Promise<FieldPending[]> {
  const rows = (await mcpExec(
    `SELECT q, r, building_config AS cfg
       FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)} AND building_config ? 'field';`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number; cfg: unknown }>;
  const pending: FieldPending[] = [];
  for (const row of rows ?? []) {
    if (hexDistance(Number(row.q), Number(row.r), wq, wr) > WAREHOUSE_RADIUS) continue;
    const cfg = parseFieldConfig(row.cfg);
    if (!cfg) continue;
    await settleFieldPayout(mapId, Number(row.q), Number(row.r), cfg).catch(() => {});
    // Кормит ли поле ИМЕННО этот склад? (у каждого поля свой ближайший).
    const nearest = await nearestWarehouse(mapId, Number(row.q), Number(row.r), WAREHOUSE_RADIUS);
    if (!nearest || nearest.q !== wq || nearest.r !== wr) continue;
    // Остаток игрока после сеттла — дробь < 1 (целые уже ушли в ячейки).
    const acc = (await mcpExec(
      `SELECT accrued FROM yuplink.raid_field_worker
        WHERE map_id = ${sqlStr(mapId)} AND q = ${row.q} AND r = ${row.r}
          AND account_id = ${sqlStr(account)};`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ accrued: number }>;
    const amount = Math.round((Number(acc?.[0]?.accrued) || 0) * 100) / 100;
    if (amount > 0)
      pending.push({
        stackKey:
          cfg.reward.kind === "item"
            ? `custom:${cfg.reward.itemId}`
            : cfg.reward.resource === "token" && cfg.reward.token
              ? `resource:token:${cfg.reward.token}`
              : `resource:${cfg.reward.resource}`,
        name:
          cfg.reward.kind === "item"
            ? cfg.reward.name
            : cfg.reward.resource === "token"
              ? (cfg.reward.token ?? "Токен")
              : "Ресурс",
        image: cfg.reward.kind === "item" ? cfg.reward.image : null,
        amount,
      });
  }
  return pending;
}
