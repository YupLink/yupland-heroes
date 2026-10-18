// Запросы, которыми мир «учится» у образцовой карты. Только SELECT: образец
// не меняется. Тексты отдельно от сборки (learn.ts), чтобы их можно было
// прогнать и сервером (мост), и скриптом (psql), и прочитать в тесте.
import { sqlStr } from "@/server/api/raid-shared";

/** Колонка offset-столбца клетки (odd-r), как у редактора: q + (r − (r & 1)) / 2. */
const COL = "(c.q + ((c.r - (c.r & 1)) >> 1))";

/** Каталог местности: id и имя (воду узнаём по имени, как корабли). */
export const terrainCatalogSql = (): string =>
  `SELECT t.id, t.name FROM yuplink.mystic_item_template t
    WHERE t.kind = 'terrain' AND COALESCE(t.active, true) ORDER BY t.id;`;

/** Местность для выбора в форме: имя и картинка. */
export const terrainListSql = (): string =>
  `SELECT t.id, t.name, t.image_url AS image FROM yuplink.mystic_item_template t
    WHERE t.kind = 'terrain' AND COALESCE(t.active, true) ORDER BY t.id;`;

/** Живой декор: id (метки удалённого шаблона генератору не нужны). */
export const decorCatalogSql = (): string =>
  `SELECT t.id FROM yuplink.mystic_item_template t
    WHERE t.kind = 'decoration' AND COALESCE(t.active, true) ORDER BY t.id;`;

/** Декор, сквозь который ходят (meta.walkable): в лабиринте он не стена. */
export const walkableDecorSql = (): string =>
  `SELECT t.id FROM yuplink.mystic_item_template t
    WHERE t.kind = 'decoration' AND COALESCE(t.active, true)
      AND t.meta->>'walkable' = 'true' ORDER BY t.id;`;

export const assetTagsSql = (): string =>
  `SELECT ref_id, terrains, races, auto FROM yuplink.raid_asset_tags ORDER BY ref_id;`;

/**
 * По местности всей карты: клеток, под домами и дорогами (городская земля в
 * области не годится), свободных (без декора, дома, дороги) и из них с
 * объектом — шанс объекта на свободной клетке.
 */
export const terrainStatsSql = (mapId: string): string =>
  `SELECT c.terrain_id AS id, count(*)::int AS n,
          count(c.building_id)::int AS bld, count(c.road_id)::int AS road,
          count(*) FILTER (WHERE c.decoration_id IS NULL AND c.building_id IS NULL
                             AND c.road_id IS NULL)::int AS free,
          count(*) FILTER (WHERE c.decoration_id IS NULL AND c.building_id IS NULL
                             AND c.road_id IS NULL AND c.object_id IS NOT NULL)::int AS obj
     FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
    GROUP BY 1 ORDER BY 1;`;

/** Местность в исходном квадрате size × size (offset [0, size)) — доли и земли областей. */
export const coreSharesSql = (mapId: string, size: number): string =>
  `SELECT c.terrain_id AS id, count(*)::int AS n
     FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
      AND c.r BETWEEN 0 AND ${size - 1} AND ${COL} BETWEEN 0 AND ${size - 1}
    GROUP BY 1 ORDER BY 1;`;

/**
 * Объекты по местности: id и сколько, плюс настройка первой по порядку клетки
 * (образец этого объекта). Только боссы и сундуки на свободных клетках.
 */
export const objectPoolSql = (mapId: string): string =>
  `SELECT c.terrain_id AS terrain, c.object_id AS id, count(*)::int AS n,
          (array_agg(c.object_config ORDER BY c.q, c.r))[1] AS cfg
     FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
      AND (c.object_id LIKE 'boss:%' OR c.object_id LIKE 'chest:%')
      AND c.decoration_id IS NULL AND c.building_id IS NULL AND c.road_id IS NULL
    GROUP BY 1, 2 ORDER BY 1, 2;`;

/** Соседство земель: пары разных местностей у соседних клеток (три стороны из шести). */
export const adjacencySql = (mapId: string): string =>
  `SELECT a.terrain_id AS a, b.terrain_id AS b, count(*)::int AS n
     FROM yuplink.raid_map_cells a
     CROSS JOIN (VALUES (1, 0), (0, 1), (-1, 1)) AS d(dq, dr)
     JOIN yuplink.raid_map_cells b
       ON b.map_id = a.map_id AND b.q = a.q + d.dq AND b.r = a.r + d.dr
    WHERE a.map_id = ${sqlStr(mapId)} AND a.terrain_id <> b.terrain_id
    GROUP BY 1, 2 ORDER BY 1, 2;`;

/** Настроенные ратуши образца: есть жители и товары — их числа и берёт новый город. */
export const townTemplatesSql = (mapId: string): string =>
  `SELECT t.config FROM yuplink.raid_town t
    WHERE t.map_id = ${sqlStr(mapId)}
      AND jsonb_typeof(t.config->'goods') = 'array'
      AND jsonb_array_length(t.config->'goods') > 0
    ORDER BY t.q, t.r;`;

/** Самая частая живая дорога образца — ею и мостятся новые города. */
export const topRoadSql = (mapId: string): string =>
  `SELECT c.road_id AS id, count(*)::int AS n
     FROM yuplink.raid_map_cells c
     JOIN yuplink.mystic_item_template t
       ON t.id = c.road_id AND t.kind = 'road' AND COALESCE(t.active, true)
    WHERE c.map_id = ${sqlStr(mapId)}
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1;`;

/** Сколько раз шаблон постройки стоит на образце: что ни разу не ставили — в мир не идёт. */
export const buildingUsageSql = (mapId: string): string =>
  `SELECT c.building_id AS id, count(*)::int AS n
     FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)} AND c.building_id IS NOT NULL
    GROUP BY 1 ORDER BY 1;`;

/**
 * Своя настройка храмов (алтарь) и покоев (цены) на образце: без неё оба
 * молчат, а у шаблонов своей нет. Новый город берёт настройку одного из них.
 */
export const buildingConfigsSql = (mapId: string): string =>
  `SELECT COALESCE(c.building_config->>'effect', t.meta->>'effect') AS effect,
          c.building_config AS cfg
     FROM yuplink.raid_map_cells c
     JOIN yuplink.mystic_item_template t ON t.id = c.building_id
    WHERE c.map_id = ${sqlStr(mapId)}
      AND (c.building_config ? 'boost' OR c.building_config ? 'chambersPrices')
    ORDER BY c.q, c.r LIMIT 200;`;

/** Функции городских построек: вокруг них — город (шахты, порталы, вышки стоят и в глуши). */
const TOWN_EFFECTS = `'town_hall','tavern','warehouse','chambers','boost','museum','university','market','spellbook'`;

/** Кольцо вокруг клеток src (гекс-расстояние ≤ k). */
const ringSql = (name: string, src: string, k: number) =>
  `${name} AS (
     SELECT DISTINCT s.q + d.dq AS q, s.r + d.dr AS r
       FROM ${src} s
       CROSS JOIN (SELECT dq, dr FROM generate_series(${-k}, ${k}) dq, generate_series(${-k}, ${k}) dr
                    WHERE abs(dq) + abs(dr) + abs(dq + dr) <= ${2 * k}) d)`;

/**
 * Город образца: два шага от городской постройки (town) и пять — от ратуши
 * (hall). Фонарь в Альфе стоит у ратуш (62 %), а не обязательно вплотную к
 * дому; грядка и колодец — у домов.
 */
const TOWN_CTE = (mapId: string) =>
  `bld AS (
     SELECT c.q, c.r, COALESCE(c.building_config->>'effect', t.meta->>'effect') AS effect
       FROM yuplink.raid_map_cells c JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)}),
   tb AS (SELECT q, r FROM bld WHERE effect IN (${TOWN_EFFECTS})),
   hb AS (SELECT q, r FROM bld WHERE effect = 'town_hall'),
   ${ringSql("town", "tb", 2)},
   ${ringSql("hall", "hb", 5)}`;

/**
 * Декор в городе и всего: что на образце стоит в основном в городах (фонари,
 * колодцы, грядки), то городской декор — в лес его не ставим.
 */
export const decorNearSql = (mapId: string): string =>
  `WITH ${TOWN_CTE(mapId)}
   SELECT c.decoration_id AS id, count(*)::int AS n,
          count(tw.q)::int AS town, count(hl.q)::int AS hall
     FROM yuplink.raid_map_cells c
     JOIN yuplink.mystic_item_template t
       ON t.id = c.decoration_id AND t.kind = 'decoration' AND COALESCE(t.active, true)
     LEFT JOIN town tw ON tw.q = c.q AND tw.r = c.r
     LEFT JOIN hall hl ON hl.q = c.q AND hl.r = c.r
    WHERE c.map_id = ${sqlStr(mapId)}
    GROUP BY 1 ORDER BY 1;`;

/** Свободные клетки у городских построек образца — знаменатель густоты городского декора. */
export const townFreeSql = (mapId: string): string =>
  `WITH ${TOWN_CTE(mapId)}
   SELECT count(*)::int AS n
     FROM yuplink.raid_map_cells c JOIN town tw ON tw.q = c.q AND tw.r = c.r
    WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
      AND c.building_id IS NULL AND c.road_id IS NULL;`;

/**
 * Постройки образца для наборов городов (learn-kits): шаблон, облик, функция
 * клетки, текст таблички, местность, привязка лавки к ратуше и имя города.
 */
export const townCellsSql = (mapId: string): string =>
  `SELECT c.q, c.r, c.building_id AS tpl, c.building_skin_id AS skin,
          COALESCE(c.building_config->>'effect', t.meta->>'effect') AS effect,
          left(c.building_config->>'text', 200) AS text, c.terrain_id AS terrain,
          s.town_q, s.town_r, rt.config->>'name' AS name
     FROM yuplink.raid_map_cells c
     JOIN yuplink.mystic_item_template t ON t.id = c.building_id
     LEFT JOIN yuplink.raid_market_shop s ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
     LEFT JOIN yuplink.raid_town rt ON rt.map_id = c.map_id AND rt.q = c.q AND rt.r = c.r
    WHERE c.map_id = ${sqlStr(mapId)}
    ORDER BY c.q, c.r;`;
