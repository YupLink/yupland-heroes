// Списание из стека рюкзака героя.
//
// Вынесено из market-backpack-write.ts ради лимита ≤250 строк; вызывающие
// по-прежнему берут его из market-backpack(-write).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  originCols,
  originSetSql,
  originTakeSql,
  originTakenSql,
  originWithin,
  takenOf,
} from "@/server/api/beta-raid/stack-origin";
import { exactQty } from "@/lib/warehouseCells";
import { wearOf } from "@/server/api/beta-raid/tool-wear-move";

/**
 * Количество единиц для SQL. Кастомный товар торгуется десятыми (0,1), поэтому
 * целое число здесь больше не требование — но и мусорный хвост
 * (0.30000000000000004) в базу пускать нельзя: режем до тысячных.
 */
const qtyNum = (qty: number): number => Math.max(0, Math.round(qty * 1000) / 1000);

/** Допуск точного списания: столько double может разойтись с numeric. */
const NOISE = "0.000000001";

/** Сколько единиц вида лежит в рюкзаке героя (0 — стека нет). */
export async function backpackStackCount(heroId: string, stackKey: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT count FROM yuplink.raid_hero_backpack
      WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)} AND count > 0;`,
    { wrapJson: true },
  )) as Array<{ count: number | string }>;
  return Math.max(0, Number(rows?.[0]?.count) || 0);
}

/** Снимок списанного: что за вид и сколько из ушедших штук с какой меткой. */
export type BackpackTakeSnapshot = {
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
  /**
   * Сколько списанных штук было добыто с мобов. Откат (returnToBackpackStack)
   * возвращает их обратно с их метками — иначе сорвавшаяся оплата молча
   * превращала бы добычу в покупку, и в сундук её было бы уже не положить.
   */
  mobTaken: number;
  /** Сколько списанных штук было с шахт (stack-origin) — откат вернёт с меткой. */
  mineTaken?: number;
  /** Сколько списанных штук было с грядок. */
  fieldTaken?: number;
  /** Сколько списанных штук было «собрано прочее» (объекты, декор, награды). */
  lootTaken?: number;
  /** Износ, ушедший со стопкой (withWear, tool-wear-move): возврат вернёт его. */
  wear?: number;
};

type Num = number | string | null;
type TakenRow = Pick<BackpackTakeSnapshot, "kind" | "refId" | "name" | "image"> & {
  count: number | string;
  mobTaken: Num;
  mineTaken?: Num;
  fieldTaken?: Num;
  lootTaken?: Num;
  wearTaken?: Num;
};

/**
 * Забрать qty единиц вида stackKey из рюкзака героя (списание). Атомарно:
 * UPDATE только если в стеке хватает (count >= qty), иначе строк не вернёт и
 * ничего не спишет. Опустевшую ячейку удаляем. Отдаёт снимок вида (kind/ref/имя/
 * картинка) — вызывающему он нужен, чтобы понять, что именно забрали. null —
 * не хватило / стека нет (гонка двух установок закрывается сама).
 *
 * `exact` — перенос на склад: девять знаков вместо тысячных и допуск на шум
 * double↔numeric, иначе «всё» у 7,738083 оставляло бы пыль, а у 39,99973
 * (до тысячных — 40) отвечало «столько нет».
 */
export async function takeFromBackpackStack(
  heroId: string,
  stackKey: string,
  qty: number,
  opts: {
    exact?: boolean;
    /**
     * Перенос на склад (tool-wear-move): уходит вся стопка — износ уходит с ней
     * и отдаётся в снимке. Без флага стопку с износом не опустить ниже штуки.
     */
    withWear?: boolean;
  } = {},
): Promise<BackpackTakeSnapshot | null> {
  const n = opts.exact ? exactQty(qty) : qtyNum(qty);
  if (n <= 0) return null;
  const left = opts.exact ? `GREATEST(0, ROUND(b.count - ${n}, 9))` : `b.count - ${n}`;
  // Метки — по правилу траты (stack-origin): безымянное уходит первым, потолок —
  // новый count. Прежние count и метки нужны, чтобы узнать, сколько каких меток
  // ушло: RETURNING видит только новую строку. Берём их подзапросом под FOR
  // UPDATE — строка заперта до записи, и параллельный вклад не вклинится между
  // «прочитал» и «списал» (иначе ушедшие метки считались бы от устаревших чисел).
  const taken = originTakenSql(
    {
      count: "o.old_count",
      mob: "o.old_mob",
      mine: "o.old_mine",
      field: "o.old_field",
      loot: "o.old_loot",
    },
    originCols("b."),
  );
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_hero_backpack b
        SET count = ${left},
            ${originSetSql(originTakeSql(originCols("b."), left))},
            ${opts.withWear ? `wear = CASE WHEN ${left} < 1 THEN 0 ELSE b.wear END,` : ""}
            updated_at = now()
       FROM (SELECT id, count AS old_count, mob_count AS old_mob, wear AS old_wear,
                    mine_count AS old_mine, field_count AS old_field, loot_count AS old_loot
               FROM yuplink.raid_hero_backpack
              WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}
                FOR UPDATE) o
      WHERE b.id = o.id AND ${opts.exact ? `b.count - ${n} > -${NOISE}` : `b.count >= ${n}`}
      RETURNING b.kind, b.ref_id AS "refId", b.name, b.image, b.count,
                ${taken.mob} AS "mobTaken", ${taken.mine} AS "mineTaken",
                ${taken.field} AS "fieldTaken", ${taken.loot} AS "lootTaken"${
                  opts.withWear
                    ? `, CASE WHEN b.count < 1 THEN o.old_wear ELSE 0 END AS "wearTaken"`
                    : ""
                };`,
    { wrapJsonCte: true },
  ).catch((e: unknown) => {
    // Изношенный инструмент из рюкзака не уходит (CHECK, §8.19): своя причина,
    // а не «столько нет». Прочие сбои — как раньше.
    if (/raid_hero_backpack_worn_stays/.test(String(e))) throw new Error("braid.tool_worn_stays");
    return [];
  })) as TakenRow[];
  const row = rows?.[0];
  if (!row) return null;
  if (Number(row.count) <= 0) {
    await mcpExec(
      `DELETE FROM yuplink.raid_hero_backpack
        WHERE hero_id=${sqlStr(heroId)} AND stack_key=${sqlStr(stackKey)} AND count<=0;`,
    ).catch(() => {});
  }
  // Пустая строка в снимке ломала возврат: где-то (админ, миграция, старый
  // тракт) в ячейку попал image = '', и тернар `image ? ... : "NULL"` в
  // returnToBackpackStack писал такую же пустую строку обратно — а рюкзак
  // рисует картинку только по непустому URL. Нормализуем на границе.
  const img = row.image && String(row.image).trim() !== "" ? String(row.image) : null;
  // Ушедшие метки — не больше списанного, с той же точностью, что и само число.
  const took = originWithin(
    n,
    { mob: row.mobTaken, mine: row.mineTaken, field: row.fieldTaken, loot: row.lootTaken },
    opts.exact ? exactQty : qtyNum,
  );
  const wear = wearOf(row.wearTaken);
  return {
    kind: row.kind,
    refId: row.refId,
    name: row.name,
    image: img,
    ...takenOf(took),
    ...(wear > 0 ? { wear } : {}),
  };
}
