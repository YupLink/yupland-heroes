// SQL газет (§8.96): выпуски редакции, размещение на картах, слой игрока,
// открыть / отложить / прочитать, полки киоска. Все записи — одним оператором
// и повторяемые: мост к базе повторяет запрос вслепую.
import type {NewspaperEditions} from "@/lib/newspaper";
import { sightRadiusSql } from "@/server/api/beta-raid/sight/sight-sql";
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL, buildingHeldSql } from "@/server/api/beta-raid/cell-sql";
import { voidSql } from "@/server/api/beta-raid/voidCells";
import { distSql, hiddenSql, type Near } from "@/server/api/beta-raid/loot-bag/bag-read-sql";

/** Поля выпуска для окна газеты и киоска; выпуск зовётся `i`. */
const ISSUE_VIEW = `i.id AS "issueId", to_char(i.issue_date, 'YYYY-MM-DD') AS date, i.title,
       i.image_url AS "imageUrl", to_jsonb(i)->'editions' AS editions`;

const published = (issue: string) =>
  `EXISTS (SELECT 1 FROM yuplink.newspaper_issue i
            WHERE i.id = ${issue} AND i.status = 'published')`;

export type IssueInput = {
  id: string;
  date: string;
  title: string | null;
  imageUrl: string;
  by: string;
  createOnly?: boolean;
  editions?: NewspaperEditions;
};

/** Новый черновик или правка черновика; размещённый не правится (строки нет). */
export const saveIssueSql = (v: IssueInput): string =>
  `INSERT INTO yuplink.newspaper_issue AS n (id, issue_date, title, image_url, created_by${v.editions ? ', editions' : ''})
   VALUES (${sqlStr(v.id)}, ${sqlStr(v.date)}::date,
           ${v.title == null ? "NULL" : sqlStr(v.title)}, ${sqlStr(v.imageUrl)}, ${sqlStr(v.by)}${v.editions ? ', '+sqlStr(JSON.stringify(v.editions))+'::jsonb' : ''})
   ON CONFLICT (id) DO UPDATE
      SET issue_date = EXCLUDED.issue_date, title = EXCLUDED.title, image_url = EXCLUDED.image_url${v.editions ? ', editions = EXCLUDED.editions' : ''}
    WHERE n.status = 'draft'${!v.editions ? " AND (to_jsonb(n)->'editions' IS NULL OR to_jsonb(n)->'editions' = 'null'::jsonb)" : ''}${v.createOnly ? ' AND n.issue_date = EXCLUDED.issue_date AND n.image_url = EXCLUDED.image_url AND n.title IS NOT DISTINCT FROM EXCLUDED.title' : ''}${v.createOnly && v.editions ? ' AND n.editions IS NOT DISTINCT FROM EXCLUDED.editions' : ''}
   RETURNING n.id;`;

export const issueStatusSql = (id: string): string =>
  `SELECT status FROM yuplink.newspaper_issue WHERE id = ${sqlStr(id)} LIMIT 1;`;

/** Выпуски для редакции: свежие первыми, с числом экземпляров и прочтений. */
export const listIssuesSql = (): string =>
  `SELECT i.id, to_char(i.issue_date, 'YYYY-MM-DD') AS date, i.title, i.image_url AS "imageUrl", to_jsonb(i)->'editions' AS editions,
          i.status,
          (SELECT count(*) FROM yuplink.newspaper_copy x WHERE x.issue_id = i.id)::int AS copies,
          (SELECT count(*) FROM yuplink.newspaper_read rd
            WHERE rd.issue_id = i.id AND rd.read_at IS NOT NULL)::int AS reads,
          i.created_at AS "createdAt", i.published_at AS "publishedAt"
     FROM yuplink.newspaper_issue i
    ORDER BY i.issue_date DESC, i.created_at DESC
    LIMIT 200;`;

/** Карты газет: живые миры (active) и острова новичков; черновики — нет. */
export const PAPER_MAPS_SQL = `SELECT m.id FROM yuplink.raid_maps m
   WHERE m.active OR EXISTS (SELECT 1 FROM yuplink.raid_island il WHERE il.map_id = m.id)`;

/**
 * Свободная клетка суши для экземпляра (`c`, шаблон местности `t`): местность
 * есть, не вода, не под куполом, нет объекта, декора и здания, нет другой газеты.
 */
const FREE_CELL = `c.terrain_id IS NOT NULL
       AND NOT COALESCE(${voidSql("c")}, false)
       AND NOT COALESCE(${WATER_SQL}, false)
       AND c.object_id IS NULL AND c.decoration_id IS NULL
       AND NOT ${buildingHeldSql("c")}
       AND NOT EXISTS (SELECT 1 FROM yuplink.newspaper_copy z
                        WHERE z.map_id = c.map_id AND z.q = c.q AND z.r = c.r)`;

/**
 * Разместить черновик: статус и экземпляры — одним оператором. На каждой карте
 * max(1, ⌊свободных клеток / per⌋) экземпляров на случайных свободных клетках.
 * Повтор (уже размещён) — ничего не делает; итог читается отдельно.
 */
export const publishSql = (id: string, per: number): string =>
  `WITH pub AS (
     UPDATE yuplink.newspaper_issue SET status = 'published', published_at = now()
      WHERE id = ${sqlStr(id)} AND status = 'draft'
      RETURNING id
   ), free AS (
     SELECT c.map_id, c.q, c.r,
            row_number() OVER (PARTITION BY c.map_id ORDER BY random()) AS n,
            count(*) OVER (PARTITION BY c.map_id) AS total
       FROM yuplink.raid_map_cells c
       JOIN (${PAPER_MAPS_SQL}) pm ON pm.id = c.map_id
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE EXISTS (SELECT 1 FROM pub) AND ${FREE_CELL}
   )
   INSERT INTO yuplink.newspaper_copy (id, issue_id, map_id, q, r)
   SELECT 'npc_' || md5(${sqlStr(id)} || ':' || f.map_id || ':' || f.q || ':' || f.r),
          ${sqlStr(id)}, f.map_id, f.q, f.r
     FROM free f
    WHERE f.n <= GREATEST(1, floor(f.total / ${Math.floor(per)}))
   ON CONFLICT DO NOTHING;`;

/** Экземпляры выпуска по картам — итог размещения. */
export const copiesByMapSql = (id: string): string =>
  `SELECT m.name AS map, count(*)::int AS copies
     FROM yuplink.newspaper_copy x JOIN yuplink.raid_maps m ON m.id = x.map_id
    WHERE x.issue_id = ${sqlStr(id)}
    GROUP BY m.name ORDER BY copies DESC;`;

/** Снять размещённый выпуск: статус и экземпляры с карт — одним оператором. */
export const withdrawSql = (id: string): string =>
  `WITH w AS (
     UPDATE yuplink.newspaper_issue SET status = 'withdrawn'
      WHERE id = ${sqlStr(id)} AND status = 'published'
      RETURNING id
   )
   DELETE FROM yuplink.newspaper_copy x WHERE x.issue_id IN (SELECT id FROM w);`;

/**
 * Экземпляры во «втором обзоре» героя — как мешочки (круг, разведанное, не под
 * куполом, не под декором). Прочитанные и отложенные игроком выпуски не отдаются.
 */
export function nearSql(o: Near): string {
  // Радиус — 20, под биноклем 40 (lib/raid/sight.ts).
  const d = sightRadiusSql(sqlStr(o.account));
  return `SELECT x.id, x.issue_id AS "issueId", x.q, x.r, (rd.deferred_at IS NOT NULL) AS deferred
       FROM yuplink.beta_raid_positions p
       JOIN yuplink.newspaper_copy x
         ON x.map_id = COALESCE(p.map_id, ${sqlStr(o.activeMapId)})
        AND x.q BETWEEN p.q - ${d} AND p.q + ${d} AND x.r BETWEEN p.r - ${d} AND p.r + ${d}
       JOIN yuplink.newspaper_issue i ON i.id = x.issue_id AND i.status = 'published'
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = x.map_id AND c.q = x.q AND c.r = x.r
       LEFT JOIN yuplink.newspaper_read rd
         ON rd.account_id = ${sqlStr(o.account)} AND rd.issue_id = x.issue_id
      WHERE p.account_id = ${sqlStr(o.account)}
        AND ${distSql("x")} <= ${d}
        AND c.decoration_id IS NULL
        AND rd.read_at IS NULL AND rd.deferred_at IS NULL
        ${hiddenSql("x", o)}
      ORDER BY ${distSql("x")}
      LIMIT 100;`;
}

/** Экземпляр моей карты: выпуск, клетка, мои отметки и декор поверх. */
export const copySql = (copyId: string, mapId: string, account: string): string =>
  `SELECT x.q, x.r, ${ISSUE_VIEW}, i.status,
          rd.deferred_at IS NOT NULL AS deferred, rd.read_at IS NOT NULL AS read,
          EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                   WHERE c.map_id = x.map_id AND c.q = x.q AND c.r = x.r
                     AND c.decoration_id IS NOT NULL) AS decor
     FROM yuplink.newspaper_copy x
     JOIN yuplink.newspaper_issue i ON i.id = x.issue_id
     LEFT JOIN yuplink.newspaper_read rd
       ON rd.account_id = ${sqlStr(account)} AND rd.issue_id = x.issue_id
    WHERE x.id = ${sqlStr(copyId)} AND x.map_id = ${sqlStr(mapId)}
    LIMIT 1;`;

/** Отметка «открыл» — пропуск к «прочитал» и «отложил»; повтор безвреден. */
export const openSql = (account: string, issueId: string): string =>
  `INSERT INTO yuplink.newspaper_read (account_id, issue_id)
   SELECT ${sqlStr(account)}, ${sqlStr(issueId)} WHERE ${published(sqlStr(issueId))}
   ON CONFLICT (account_id, issue_id) DO NOTHING;`;

/**
 * Прочитал: время — первое, сохранение в киоске — по киоску в момент первого
 * прочтения (SET видит старые значения строки). Только открытый выпуск;
 * отложенный — только с киоском (Кай, 31.10).
 */
export const readSql = (account: string, issueId: string, kiosk: boolean): string =>
  `UPDATE yuplink.newspaper_read rd
      SET saved = CASE WHEN rd.read_at IS NULL THEN ${kiosk} ELSE rd.saved END,
          read_at = COALESCE(rd.read_at, now())
    WHERE rd.account_id = ${sqlStr(account)} AND rd.issue_id = ${sqlStr(issueId)}
      AND (${kiosk} OR rd.deferred_at IS NULL)
      AND ${published("rd.issue_id")}
    RETURNING rd.saved;`;

/** Отложил: только открытый и ещё не прочитанный. */
export const deferSql = (account: string, issueId: string): string =>
  `UPDATE yuplink.newspaper_read rd SET deferred_at = COALESCE(rd.deferred_at, now())
    WHERE rd.account_id = ${sqlStr(account)} AND rd.issue_id = ${sqlStr(issueId)}
      AND rd.read_at IS NULL AND ${published("rd.issue_id")}
    RETURNING true AS ok;`;

/** Моя строка выпуска — для точного отказа после пустого UPDATE. */
export const markSql = (account: string, issueId: string): string =>
  `SELECT rd.deferred_at IS NOT NULL AS deferred, rd.read_at IS NOT NULL AS read
     FROM yuplink.newspaper_read rd
    WHERE rd.account_id = ${sqlStr(account)} AND rd.issue_id = ${sqlStr(issueId)}
      AND ${published("rd.issue_id")}
    LIMIT 1;`;

/** Полки киоска: отложенные непрочитанные и сохранённые прочитанные. */
export const kioskSql = (account: string): string =>
  `SELECT ${ISSUE_VIEW}, rd.read_at IS NOT NULL AS read, rd.deferred_at IS NOT NULL AS deferred
     FROM yuplink.newspaper_read rd
     JOIN yuplink.newspaper_issue i ON i.id = rd.issue_id AND i.status = 'published'
    WHERE rd.account_id = ${sqlStr(account)}
      AND ((rd.read_at IS NULL AND rd.deferred_at IS NOT NULL)
           OR (rd.read_at IS NOT NULL AND rd.saved))
    ORDER BY i.issue_date DESC
    LIMIT 500;`;

/** Add EN to an existing issue exactly once, without reprinting or replacing RU. */
export const addIssueEnglishSql=(v:{id:string;expectedImageUrl:string;editions:NewspaperEditions})=> {
 const editions=sqlStr(JSON.stringify(v.editions))+'::jsonb';
 return `UPDATE yuplink.newspaper_issue n SET editions = ${editions}
 WHERE n.id=${sqlStr(v.id)} AND n.status='published' AND n.image_url=${sqlStr(v.expectedImageUrl)}
 AND (n.editions IS NULL AND ${editions}->'ru'->'spreadUrls'=jsonb_build_array(n.image_url)
      AND ${editions}->'ru'->>'title'=COALESCE(n.title,'Вестник героев')
      OR n.editions=${editions})
 RETURNING n.id;`;
};
