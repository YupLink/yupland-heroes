// Снять героя с грядки — общее ядро снятия рядом (field.ts) и издалека
// (field-recall.ts, после него герой отдыхает — restMs).
//
// Снятие — CAS одним оператором: «стоял этот герой → не стоит никто». Два
// снятия разом (рядом и издалека, два нажатия) иначе оба считали бы себя
// снявшими: дробный хвост уходил бы дважды, а платное не узнало бы, что деньги
// пора вернуть. Замок — тот же advisory-lock поля, что у raid_field_join/take/
// leave. Ключ снятия ложится в журнал поля (raid_field_op) тем же оператором:
// мост повторяет запрос вслепую, и повтор, увидев свой ключ, знает, что снимал
// он сам, а не сосед.
//
// Дробный хвост: без него дробь <1 застревала навсегда — raid_field_take
// забирает только floor(accrued), а settle прибавляет только тем, у кого
// hero_id NOT NULL. Игроки жаловались «куча жёлтого/яблок висит, а сбор ноль».
// Округляем до целого вверх (товар — на ближайший склад, ресурс — на счёт) и
// обнуляем accrued. Максимум «переплата» — почти 1 единица; проще на игрока,
// чем терять её насовсем. Выдаёт его только тот, кто героя действительно снял.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { FieldConfig } from "@/lib/fieldConfig";
import { heroLockSql } from "../hero-rest";

export type Leave = {
  wallet: string;
  account: string;
  mapId: string;
  q: number;
  r: number;
  /** Конфиг поля — нужен хвосту. null: поле сломано, снимаем без хвоста. */
  cfg: FieldConfig | null;
  /** Кого снимаем. null — того, кто сейчас стоит от аккаунта (снятие рядом). */
  heroId: string | null;
  /** Ключ снятия в журнале поля. null — одноразовый на этот вызов. */
  key: string | null;
  /**
   * Отдых после снятия, мс (снятие издалека, hero-rest.ts). Ложится ТЕМ ЖЕ
   * оператором, что и снятие: снят — значит и отдыхает, повтор моста второй
   * раз его не продлит. Отдыхающий с ним же перестаёт быть основным: основным
   * ходят и дерутся, а с отдыхающим ничего делать нельзя. Только при heroId.
   */
  restMs?: number;
};

/**
 * Снял ли героя вызов с этим ключом: накопленное в миг снятия или null, если
 * ключа в журнале нет. Так свой повтор отличается от чужого снятия.
 */
export async function leftByKey(key: string): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT units::float8 AS units FROM yuplink.raid_field_op
      WHERE op = ${sqlStr(`lv:${key}`)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ units: number | null }>;
  const row = rows?.[0];
  return row ? Number(row.units) || 0 : null;
}

/** Оператор CAS-снятия (и отдыха, если задан) — текстом: так его видно в тестах
 *  и на живой базе через EXPLAIN (scripts/check-hero-rest-sql.ts). */
export function casLeaveSql(o: Leave, key: string): string {
  const lv = sqlStr(`lv:${key}`);
  const who = o.heroId ? `w.hero_id = ${sqlStr(o.heroId)}` : "w.hero_id IS NOT NULL";
  const restMs = o.heroId && o.restMs && o.restMs > 0 ? Math.round(o.restMs) : 0;
  // Уже идущий отдых не укорачиваем: берём дальний из сроков.
  const rest = restMs
    ? `,
     rest AS (
       UPDATE yuplink.hero_instance h
          SET rest_until = GREATEST(COALESCE(h.rest_until, now()),
                                    now() + interval '${restMs} milliseconds'),
              selected_at = NULL
        WHERE h.id = ${sqlStr(o.heroId as string)} AND EXISTS (SELECT 1 FROM up)
       RETURNING 1
     )`
    : "";
  // Снятие конкретного героя — под его замком, как постановка на грядку и смена
  // основного: иначе снятого издалека успевали поставить на другую грядку по
  // снимку «ещё не отдыхает». Замок героя — первым, грядки — вторым, как там.
  return `${o.heroId ? heroLockSql(o.heroId) : ""}
     WITH _lock AS (
       SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`field:${o.mapId}:${o.q}:${o.r}`)})) AS l
     ),
     up AS (
       UPDATE yuplink.raid_field_worker w SET hero_id = NULL
        WHERE w.map_id = ${sqlStr(o.mapId)} AND w.q = ${o.q} AND w.r = ${o.r}
          AND w.account_id = ${sqlStr(o.account)} AND ${who}
          AND (SELECT true FROM _lock)
       RETURNING w.accrued
     ),
     mark AS (
       INSERT INTO yuplink.raid_field_op (op, units) SELECT ${lv}, accrued FROM up
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )${rest}
     SELECT (SELECT count(*) FROM up)::int AS removed,
            (SELECT accrued::float8 FROM up) AS accrued,
            (SELECT units::float8 FROM yuplink.raid_field_op WHERE op = ${lv}) AS prior;`;
}

/**
 * CAS-снятие. Вернёт накопленное в момент снятия; null — героя сняли без нас.
 *
 * Замок — подзапросом-фильтром, а не соединением в FROM: условие без полей
 * строки планировщик вычисляет один раз ДО чтения строки, и строка-замок не
 * попадает в перепроверку обновлённой строки (EvalPlanQual).
 */
async function casLeave(o: Leave, key: string): Promise<number | null> {
  const rows = (await mcpExec(casLeaveSql(o, key), { wrapJson: false })) as Array<{
    removed: number | string | null;
    accrued: number | null;
    prior: number | null;
  }>;
  const row = rows?.[0];
  if (Number(row?.removed) > 0) return Number(row?.accrued) || 0;
  // Ноль строк — не всегда «сняли без нас»: так же выглядит повтор моста после
  // уже прошедшего снятия. Свой ключ в журнале — значит снимали мы.
  if (row?.prior !== null && row?.prior !== undefined) return Number(row.prior) || 0;
  // Снимок оператора берётся ДО замка (ПРАВИЛА §8.15): повтор моста, догнавший
  // ещё не закрытую первую попытку, её ключа не видит. К этому мигу она уже
  // закрыта (строку героя мы ждали за ней) — перечитываем журнал отдельно.
  return leftByKey(key);
}

/** Хвост <1 — одной единицей: товар на ближайший склад, ресурс на счёт. */
async function giveDust(o: Leave, cfg: FieldConfig): Promise<void> {
  try {
    const { giveFieldReward } = await import("./field-reward");
    const { creditItemToWarehouse, nearestWarehouse } = await import("./warehouse-store");
    const { WAREHOUSE_RADIUS } = await import("./field-settle");
    if (cfg.reward.kind === "item") {
      const wh = await nearestWarehouse(o.mapId, o.q, o.r, WAREHOUSE_RADIUS);
      if (wh) {
        const { canonRef } = await import("./item-alias");
        const canonId =
          (await canonRef("custom", cfg.reward.itemId, cfg.reward.name)) ?? cfg.reward.itemId;
        await creditItemToWarehouse({
          mapId: o.mapId,
          at: wh,
          account: o.account,
          stackKey: `custom:${canonId}`,
          snap: { kind: "custom", refId: canonId, name: cfg.reward.name, image: cfg.reward.image },
          units: 1,
          // Клетка грядки в op — след раскладки в журнале сделок (ПРАВИЛА §8.13).
          op: `flx:${o.q},${o.r}:${nanoid(12)}`,
          origin: "field",
        });
      }
    } else {
      await giveFieldReward({
        wallet: o.wallet,
        account: o.account,
        reward: cfg.reward,
        units: 1,
        ref: `field-leave:${o.mapId}:${o.q}:${o.r}:${o.account}:${nanoid(10)}`,
        nonce: nanoid(12),
      });
    }
    // Обнуляем accrued только если выдача не бросила: иначе игрок получит
    // подарок, а хвост потом ещё раз догонится.
    await mcpExec(
      `UPDATE yuplink.raid_field_worker SET accrued=0
        WHERE map_id=${sqlStr(o.mapId)} AND q=${o.q} AND r=${o.r}
          AND account_id=${sqlStr(o.account)};`,
    ).catch(() => {});
  } catch (e) {
    console.warn("[field-leave] выдача дроби не удалась:", e);
  }
}

/**
 * Снять героя с грядки. removed=false — снимать было некого (сняли раньше:
 * рядом, вторым нажатием или сменой героя). Бросает, если сорвался сеттл или
 * сам оператор снятия — тогда исход надо уточнить по ключу (leftByKey).
 */
export async function leaveFieldWork(o: Leave): Promise<{ removed: boolean; dust: number }> {
  // Settle обновит accrued активному игроку до момента снятия. Сорвался — не
  // снимаем: снятый потерял бы накопленное с прошлого сеттла (ушло бы соседям).
  // Прежний raid_field_leave тоже не снимал без сеттла — они шли одной транзакцией.
  await mcpExec(`SELECT yuplink.raid_field_settle(${sqlStr(o.mapId)}, ${o.q}, ${o.r});`);
  const accrued = await casLeave(o, o.key ?? `near:${nanoid(12)}`);
  if (accrued === null) return { removed: false, dust: 0 };
  // Целые уже раздал settleFieldPayout (окно поля, склад) — здесь остаётся
  // только дробь. Округляем её вверх (даём одну единицу), если она есть.
  const dust = o.cfg && accrued > 0 && accrued < 1 ? 1 : 0;
  if (dust > 0 && o.cfg) await giveDust(o, o.cfg);
  return { removed: true, dust };
}
