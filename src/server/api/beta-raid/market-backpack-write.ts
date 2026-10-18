// Запись в рюкзак героя: положить, забрать, вернуть — и канонический ключ
// стека, по которому вид товара находит свою ячейку.
//
// Отделено от market-backpack.ts (чтение героя и проверка места) ради лимита
// ≤250 строк: там «сколько влезет», здесь «кладём и снимаем».
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { potionBagFit } from "@/lib/hero/potionBag";
import type { MarketItem } from "@/lib/marketItem";
import { canonCustomMeta, refFromStackKey, stackKeyFor, type StackItem } from "./item-alias";
import { IS_POTION_SQL, POTION_JOIN, potionKeysOf } from "./potion-bag";
import {
  originAdds,
  originCols,
  originGrowSql,
  originSetSql,
  type OriginQty,
  type StackOrigin,
} from "@/server/api/beta-raid/stack-origin";

// Ключ стека живёт рядом с каноном вида (item-alias) — единственная дверь к
// stack_key; здесь он только переиздан для прежних вызывающих.
export { stackKeyFor } from "./item-alias";
// Списание и возврат штук в стек (откат оплаты) — в своих модулях ради лимита
// ≤250 строк.
export { takeFromBackpackStack, type BackpackTakeSnapshot } from "./market-backpack-take";
export { returnToBackpackStack } from "./market-backpack-return";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Ответ выдачи: occ — занято в рюкзаке (обычные товары), pocc — в сумке (все
 * зелья), grow — прирост ячеек, need_occ — занято в своём хранилище после
 * выдачи, claimed — «ключ занят нами».
 */
type RoomRow = {
  occ: number | string;
  need_occ: number | string;
  pocc: number | string;
  grow: number | string;
  claimed: boolean;
};

/**
 * Строка ответа выдачи. Формат зависит от канала: прямой отдаёт `_row`
 * объектом, мост — объектом или строкой JSON (как chest-row.sqlRow). Не
 * разобрали — undefined, и выдачу решает ключ операции (см. ниже).
 */
function roomRow(raw: unknown): RoomRow | undefined {
  const inner = raw && typeof raw === "object" && "_row" in raw ? raw._row : raw;
  if (typeof inner !== "string") return (inner ?? undefined) as RoomRow | undefined;
  try {
    return JSON.parse(inner) as RoomRow;
  } catch {
    return undefined;
  }
}

/**
 * Положить qty единиц товара герою: зелье — в сумку, прочее — в рюкзак.
 * Атомарный UPSERT по (hero_id, stack_key): вид уже лежит → count += qty, иначе
 * новая ячейка. Повтор одной и той же покупки отсекается ключом операции
 * (raid_backpack_op) — на слово транспорта здесь полагаться нельзя, слепой
 * ретрай удваивал стек.
 */
export async function depositToBackpack(opts: {
  heroId: string;
  account: string;
  /** Полный товар витрины или минимум (вид/ref/имя/картинка) от разборки, склада, наград. */
  item: StackItem & Pick<MarketItem, "image">;
  qty: number;
  nonce: string;
  /** Ёмкость рюкзака в ячейках — проверяется атомарно с записью (см. ниже). */
  capacity: number;
  /** Ёмкость сумки зелий — зелье (галочка у товара) ложится ТОЛЬКО в неё. */
  potionCapacity: number;
  /** Прежний флаг «с мобов» (= origin "mob"); origin важнее. */
  mob?: boolean;
  /**
   * Происхождение (stack-origin): вся выдача одной меткой — "mob" (бой),
   * "mine" (шахта), "field" (грядка), "loot" (объект карты, декор, награда
   * рейда, грабёж, возврат из своего сундука) — или точный разбор штук по
   * меткам (перенос со склада). Без него — «безымянное»: покупка, крафт,
   * плата. В магический сундук идёт только помеченное.
   */
  origin?: StackOrigin | Partial<OriginQty> | null;
}): Promise<void> {
  const { heroId, account, item, qty, nonce } = opts;
  const add = originAdds(qty, opts.origin, opts.mob);
  const stackKey = await stackKeyFor(item);
  // Зелье — только в сумку, прочее — только в рюкзак (правило владельца 29.09).
  const potion = (await potionKeysOf([stackKey])).has(stackKey);
  const { capacity } = opts;
  // Не число (старый вызов) — ноль: зелье тогда не ляжет, а не уйдёт в SQL «NaN».
  const pc = Math.max(0, Math.floor(Number(opts.potionCapacity) || 0));
  // Подпись стека берём у КАНОНА, а не у позиции витрины: один и тот же банан
  // приходил то «Бананом», то «Бананами» — по названию торговой строки.
  const canonId = refFromStackKey(stackKey);
  const canon = await canonCustomMeta(canonId);
  const name = canon?.name?.trim() || item.name;
  // ref_id тоже от канона, если товар пришёл без него (доска со склада,
  // старая разборка): иначе ячейка канона оставалась без ссылки на шаблон.
  const refId = item.refId ?? (canon ? canonId : null);
  // Одна политика на всё: пустой image считаем отсутствием, а не строкой.
  const rawImage = canon?.image ?? item.image;
  const image = rawImage && String(rawImage).trim() !== "" ? rawImage : null;
  const op = `bp:${nonce}`;

  // Место И запись — ОДИН шаг под advisory-локом по герою: раздельная проверка
  // «влезет ли» пропускала параллельные выдачи (урожай пачкой, быстрые тапы),
  // и рюкзак раздувало выше ёмкости. op-ключ и вставка идут только если влезло.
  // Лок — ОТДЕЛЬНЫМ оператором перед WITH (как tool-wear.ts, chest-pickup-sql):
  // в READ COMMITTED снимок оператора берётся до его выполнения, и лок внутри
  // того же WITH не освежал чтение — две выдачи разом обе видели место без
  // соседа (сумка 4/3). Операторы одной строки — одна неявная транзакция: лок
  // держится до её конца, ответ — последнего оператора.
  //
  // Хранилище своё у каждого вида, как в assertBackpackRoomFor. Рюкзак (только
  // обычные товары): потолок GREATEST(ёмкость, занято) — он бывает НАД
  // ёмкостью (склад, снятый артефакт), и голая ёмкость запирала бы даже долив в
  // неполную ячейку; запрещаем только НОВЫЕ ячейки сверх потолка. Сумка (все
  // зелья): строго «после выдачи — не больше ёмкости», без GREATEST, —
  // переполненная сумка не берёт даже долив (potionBagFit).
  const rows = (await mcpExec(
    `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;
     WITH prior AS (
       -- Повтор той же операции (mcpExec вслепую повторяет запись до 4 раз,
       -- когда ответ потерялся уже ПОСЛЕ коммита). Читаем ключ здесь же, под
       -- локом: снаружи это не спасало — наша же первая вставка успевала
       -- занять место, повтор видел «не влезает» и получал отказ, а вызывающий
       -- по отказу возвращал деньги ПОВЕРХ выданного товара.
       SELECT EXISTS(SELECT 1 FROM yuplink.raid_backpack_op
                      WHERE op = ${sqlStr(op)}) AS was
     ),
     room AS (
       SELECT
         COALESCE((SELECT count FROM yuplink.raid_hero_backpack
                    WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)}), 0) AS cur,
         COALESCE((SELECT SUM(CEIL(b.count::numeric / ${CELL_SIZE}))
                     FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                    WHERE b.hero_id = ${sqlStr(heroId)} AND NOT ${IS_POTION_SQL}), 0) AS items,
         COALESCE((SELECT SUM(CEIL(b.count::numeric / ${CELL_SIZE}))
                     FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                    WHERE b.hero_id = ${sqlStr(heroId)} AND ${IS_POTION_SQL}), 0) AS potions
     ),
     grow AS (
       SELECT items, potions,
              CEIL((cur + ${qty})::numeric / ${CELL_SIZE}) - CEIL(cur::numeric / ${CELL_SIZE}) AS d
         FROM room
     ),
     fits AS (
       SELECT items AS occ,
              potions AS pocc,
              d AS grow,
              ${potion ? "potions" : "items"} + d AS need_occ
         FROM grow
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${sqlStr(op)} FROM fits, prior
        WHERE NOT prior.was AND ${potion ? `need_occ <= ${pc}` : `need_occ <= GREATEST(${capacity}, occ)`}
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     ins AS (
       INSERT INTO yuplink.raid_hero_backpack
          (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
           mob_count, mine_count, field_count, loot_count)
       SELECT ${sqlStr(`bp_${nonce}`)}, ${sqlStr(heroId)}, ${sqlStr(account)}, ${sqlStr(item.kind)},
              ${refId ? sqlStr(refId) : "NULL"}, ${item.id ? sqlStr(item.id) : "NULL"}, ${sqlStr(stackKey)},
              ${sqlStr(name)}, ${image ? sqlStr(image) : "NULL"}, ${qty},
              ${add.mob}, ${add.mine}, ${add.field}, ${add.loot}
         FROM claim
       ON CONFLICT (hero_id, stack_key) DO UPDATE
         SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
             ${originSetSql(originGrowSql(originCols("yuplink.raid_hero_backpack."), originCols("EXCLUDED.")))},
             updated_at = now()
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT occ FROM fits) AS occ,
              (SELECT need_occ FROM fits) AS need_occ,
              (SELECT pocc FROM fits) AS pocc,
              (SELECT grow FROM fits) AS grow,
              ((SELECT was FROM prior) OR EXISTS(SELECT 1 FROM claim)) AS claimed
     ) _t;`,
    // БЕЗ обёртки намеренно. wrapJson/wrapJsonCte заворачивают запрос ещё в один
    // WITH, и наши INSERT-ы съезжают на второй уровень — Postgres отвечает
    // «WITH clause containing a data-modifying statement must be at the top
    // level», и ломается ВСЯ выдача в рюкзак (охрана, доски, награды, покупки).
    // Поэтому JSON собираем сами, прямо здесь, а изменяющая часть остаётся
    // верхним уровнем.
  )) as Array<{ _row?: RoomRow } | RoomRow>;

  const r = roomRow(rows?.[0]);
  // Ответ не разобрался (мост отдал не тот результат, пусто) — судим по ключу
  // операции: он ложится только вместе с записью. Слепой отказ здесь не
  // безопасен: вызывающий вернул бы деньги или полку поверх выданного.
  if (typeof r?.claimed !== "boolean") {
    const done = (await mcpExec(
      `SELECT EXISTS(SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(op)}) AS was;`,
      { wrapJson: true },
    )) as Array<{ was?: boolean }>;
    if (done?.[0]?.was === true) return;
  }
  if (!r?.claimed) {
    // Не влезло (или гонка догнала у самого предела). Сообщаем числами —
    // те же ключи и та же арифметика, что у assertBackpackRoomFor.
    if (potion) {
      const pocc = num(r?.pocc);
      const bag = potionBagFit({ before: pocc, after: pocc + num(r?.grow), capacity: pc });
      throw new Error(`market.potion_bag_need:${bag.need}:${bag.free}`);
    }
    const occ = num(r?.occ);
    const free = Math.max(0, capacity - occ);
    throw new Error(`market.backpack_need:${Math.max(1, num(r?.need_occ) - occ)}:${free}`);
  }
}
