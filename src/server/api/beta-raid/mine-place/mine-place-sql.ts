// Постановка шахты из заготовки — одним оператором «всё или ничего»: проверка
// клетки и природы вокруг, постройка на клетке, строка хозяина шахты, списание
// заготовки из рюкзака и энергии за постановку, снятие возврата срубленного
// дерева и чертежа клетки, рост edit_seq карты и ключ нажатия (ПРАВИЛА §8.59.8).
// Энергия — touch_energy_atomic в том же WITH и только вместе с шахтой: нехватка
// бросает not_enough_energy, и назад уходит всё — ни шахты, ни траты; повтор
// нажатия (ключ уже лежит) шахту не ставит и второй раз не платит.
//
// Клетка свободна — те же признаки, что у сундука (chest-cell: постройка, живой
// объект, вода, купол, сундук и бугорок, живая охрана, декор, судно), плюс своё:
// не дорога, не блок клеток, на клетке нет ни объекта (и повергнутого — он
// встанет снова), ни декора, и не стоит ДРУГОЙ игрок (под себя ставить можно —
// «своя или соседняя клетка»). Ещё клетку держит живой мешочек (на земле или
// закопанный: под шахтой «Выкопать» закрыто, §8.59 п. 9, — вещи пропали бы):
// с живой порцией или с забором в полёте (откат вернёт порции) — как у сборщика
// (bag-read-sql.sweepSql). Пустой или сгоревший, ждущий уборки, клетку не держит:
// игрок его не видит. Родная клетка точки возрождения моба клетку не держит:
// моб ждёт свободную (§8.49 п. 2). Требование места — mine-place-need-sql:
// лесопилке и каменной — 3 дерева или горы вокруг, золотой и алмазной — жила
// своего вида под клеткой (raid_map_vein). Проход не проверяем (владелец,
// 22.10.2026: «если шахта преградит путь — то и пусть — давать размещать»).
//
// Локи — отдельными операторами до WITH (§8.15: лок внутри WITH не освежает
// снимок), в порядке переносов режима бога: карта, рюкзак героя, очередь
// возврата декора, клетка (общая с сундуками и мобами), мешочки клетки (общий
// с выбросом в мешочек), шахта (общая с raid_mine_*). Строка рюкзака заперта
// FOR UPDATE.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originSetSql, originTakeSql, originCols } from "@/server/api/beta-raid/stack-origin";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import {
  CELL_HELD,
  cellAt,
  cellExtraSql,
  cellFlagsSql,
  cellLockKey,
} from "@/server/api/beta-raid/chest/chest-cell";
import { mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";
import { placeNeedSql } from "@/server/api/beta-raid/mine-place/mine-place-need-sql";
import { MINE_PLACE_BUILDING, minePlaceConfig, type PlaceableBlueprint } from "@/lib/minePlacement";

/** Остаток меньше тысячной — это вся штука: пыль ячейкой не висит. */
const DUST = 0.001;

/** Ответ постановки: повтор, поставлено, и почему нет. */
export type PlaceMineRow = {
  was: boolean;
  placed: boolean;
  /** Клетки нет на карте. */
  cell: boolean;
  /** Клетку держит то же, что держит сундук (CELL_HELD). */
  busy: boolean | null;
  road: boolean | null;
  /** Блок клеток, объект (и повергнутый) или декор на клетке. */
  taken: boolean | null;
  /** Живой мешочек на клетке — на земле или закопанный. */
  bag: boolean | null;
  /** На клетке стоит другой игрок. */
  player: boolean | null;
  /** Природа вокруг — у лесопилки и каменной; у золотой и алмазной null. */
  trees: number | string | null;
  mountains: number | string | null;
  /** Жила своего вида под клеткой — у золотой и алмазной; у остальных null. */
  vein: boolean | null;
  /** Заготовка есть в рюкзаке (целая штука). */
  box: boolean;
  /** Рядом прибавилась шахта после проверки прохода — проверить заново. */
  moved: boolean | null;
  /** Сколько раз списали энергию: 1 — вместе с шахтой, 0 — не ставили. */
  paid?: number | string | null;
};

export type PlaceMineAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
  stackKey: string;
  kind: PlaceableBlueprint;
  op: string;
  /** Энергия за постановку (minePlaceEnergy); 0 — даром. */
  energy: number;
  /** Цена захвата новой шахты с усилением чертежа (lib/mineBoost); нет — базовая. */
  captureCost?: number;
};

/** Лок шахты — тот же ключ, что у raid_mine_* в базе. */
export const mineLockKey = (mapId: string, q: number, r: number): string =>
  `mine:${mapId}:${q}:${r}`;

export function placeMineSql(o: PlaceMineAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const at = cellAt(o.mapId, q, r);
  const energy = Math.max(0, Number(o.energy) || 0);
  const need = placeNeedSql(o.kind, o.mapId, q, r);
  const base = minePlaceConfig(o.kind);
  const capture = Math.max(base.captureCost, Math.floor(Number(o.captureCost) || 0));
  const cfg = sqlStr(JSON.stringify({ ...base, captureCost: capture }));
  const b = originCols("b.");
  return `${locksSql(
    `godmove:${o.mapId}`,
    `bp:${o.heroId}`,
    "decor-respawn",
    cellLockKey(o.mapId, q, r),
    `lootdrop:${o.mapId}:${q}:${r}`,
    mineLockKey(o.mapId, q, r),
  )}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_mine_place_op WHERE op = ${key}
     ),
     f AS (${cellFlagsSql(o.mapId, q, r)}),
     ex AS (${cellExtraSql(o.mapId, q, r)}),
     mc AS (
       SELECT ${mineCellColsSql(o.account, at)}
         FROM yuplink.raid_map_cells c
        WHERE ${at("c")}
        LIMIT 1
     ),
     ${need.cte},
     /* Заготовка: целая штука; изношенная остаётся в стопке. */
     box AS (
       SELECT b.id FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.stack_key = ${sqlStr(o.stackKey)}
          AND b.count >= 1 AND (b.wear = 0 OR b.count >= 2)
          FOR UPDATE
     ),
     go AS (
       SELECT 1 FROM f, ex, mc, ${need.from}, box
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ${CELL_HELD}
          AND NOT mc.road AND NOT mc.taken AND NOT mc.player AND NOT mc.bag
          AND ${need.ok}
     ),
     setc AS (
       UPDATE yuplink.raid_map_cells c
          SET building_id = ${sqlStr(MINE_PLACE_BUILDING[o.kind])},
              building_config = ${cfg}::jsonb,
              building_skin_id = NULL,
              saved_at = now()
         FROM go
        WHERE ${at("c")} AND c.building_id IS NULL AND c.decoration_id IS NULL
       RETURNING c.q
     ),
     own AS (
       INSERT INTO yuplink.raid_mine_state
         (map_id, q, r, owner_account, owner_wallet, captured_at, claimed_hours,
          mode, life_left, life_at, accrue_from)
       SELECT ${m}, ${q}, ${r}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)}, now(), 0,
              'base', 1, now(), now()
         FROM setc
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET owner_account = EXCLUDED.owner_account, owner_wallet = EXCLUDED.owner_wallet,
              captured_at = now(), claimed_hours = 0, mode = 'base', life_left = 1,
              life_at = now(), accrue_from = now()
       RETURNING 1
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - 1,
              ${originSetSql(originTakeSql(b, "b.count - 1"))},
              updated_at = now()
         FROM box, setc
        WHERE b.id = box.id AND b.count - 1 >= ${DUST}
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING box, setc
        WHERE b.id = box.id AND b.count - 1 < ${DUST} AND b.wear = 0
       RETURNING 1
     ),
     /* Место срубленного дерева: дерево здесь больше не вырастает. */
     regrow AS (
       DELETE FROM yuplink.raid_decor_respawn d USING setc WHERE ${at("d")} RETURNING 1
     ),
     /* След прежней шахты: повергнутая охрана и тир постройки — не наследуются. */
     ghost AS (
       DELETE FROM yuplink.raid_mine_guard g USING setc
        WHERE ${at("g")} AND (g.killed_at IS NOT NULL OR g.current_hp <= 0)
       RETURNING 1
     ),
     tier AS (
       DELETE FROM yuplink.beta_raid_building_state s USING setc WHERE ${at("s")} RETURNING 1
     ),
     /* Правка карты: черновик редактора, открытый до неё, шахту не сотрёт. */
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM setc WHERE mp.id = ${m}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_mine_place_op (op, account_id, map_id, q, r, kind)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, ${q}, ${r}, ${sqlStr(o.kind)} FROM setc
       RETURNING 1
     ),
     /* Энергия — только вместе с шахтой; нехватка роняет всё (not_enough_energy). */
     paid AS (
       SELECT 1 FROM setc
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet)}, ${energy}::numeric) e
        WHERE ${energy} > 0
     ),
     /* Чертёж на этой клетке сделал своё (raid_mine_plan, minev2-41). */
     unplan AS (
       DELETE FROM yuplink.raid_mine_plan pl USING setc
        WHERE pl.account_id = ${sqlStr(o.account)} AND ${at("pl")}
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM setc) AS placed,
              EXISTS (SELECT 1 FROM f) AS cell,
              (SELECT ${CELL_HELD} FROM f, ex) AS busy,
              (SELECT mc.road FROM mc) AS road,
              (SELECT mc.taken FROM mc) AS taken,
              (SELECT mc.bag FROM mc) AS bag,
              (SELECT mc.player FROM mc) AS player,
              ${need.trees} AS trees,
              ${need.mountains} AS mountains,
              ${need.vein} AS vein,
              EXISTS (SELECT 1 FROM box) AS box,
              false AS moved,
              (SELECT count(*) FROM paid)::int AS paid
     ) _t;`;
}
