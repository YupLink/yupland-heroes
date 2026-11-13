// SQL сводки для новостей: общие цифры и лидеры одним запросом каждое.
//
// Каждая цифра — из журнала, где одна строка = одно действие игрока:
//   играли — разные аккаунты в журнале трат энергии (last_seen_at для прошлого
//     дня не годится: вернувшийся сегодня перезаписал бы вчерашний вход);
//   шаги и рубка/добыча — energy_spend_daily (день UTC, причина step / decor,
//     n = число действий; шаг пишется на каждую клетку, пачка — тоже по клетке);
//   энергия — сумма всех трат того же журнала;
//   бои — beta_raid_object_run (бой с объектом карты, killed — победа);
//   захваты шахт — raid_mine_capture_log kind='capture' (новый хозяин new_account);
//   посадки, земля, динамит — их журналы операций.
// Причины «fight» / «build» / «mine_capture» в журнале энергии шире своих
// имён (выжигание способностью, посадка, гриб) — для счёта действий не годятся.
// Богатство — «сейчас на руках»: account_resources, DARAI — сальдо acc_ledger.
// Админы (ADMIN_WALLETS / ADMIN_TG_ACCOUNTS) не входят никуда.
import { sqlStr } from "@/server/api/raid-shared";

export type AdminLists = { wallets: string[]; tgIds: number[] };

/** CTE `adm(id)` — аккаунты админов; пустые списки — пустая таблица. */
export function adminCte(adm: AdminLists): string {
  const parts: string[] = [];
  const tg = adm.tgIds.filter((n) => Number.isSafeInteger(n) && n > 0);
  if (tg.length)
    parts.push(`SELECT a.id FROM yuplink.accounts a WHERE a.telegram_id IN (${tg.join(", ")})`);
  if (adm.wallets.length)
    parts.push(
      `SELECT u.account_id FROM yuplink.users u
        WHERE u.account_id IS NOT NULL AND u.wallet IN (${adm.wallets.map(sqlStr).join(", ")})`,
    );
  return `adm(id) AS (${parts.length ? parts.join(" UNION ") : "SELECT NULL::text WHERE false"})`;
}

const notAdmin = (col: string) => `NOT EXISTS (SELECT 1 FROM adm WHERE adm.id = ${col})`;

/** Полночь UTC начала окна: «1 день» — сегодня, «7» — сегодня и шесть до него. */
export function windowStart(days: number, now: number = Date.now()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

/** Окно по колонке времени: `>= from` и, если конец задан, `< to`. */
export function windowSql(col: string, fromIso: string, toIso: string | null, cast = ""): string {
  const end = toIso ? ` AND ${col} < ${sqlStr(toIso)}${cast}` : "";
  return `${col} >= ${sqlStr(fromIso)}${cast}${end}`;
}

/** Одна строка общих цифр. Числа — текстом (numeric), разбирает вызывающий. */
export function totalsSql(fromIso: string, toIso: string | null, adm: AdminLists): string {
  const at = (col: string) => windowSql(col, fromIso, toIso);
  const count = (table: string, col: string, who: string, extra = "") =>
    `(SELECT count(*) FROM yuplink.${table} x
       WHERE ${at(`x.${col}`)}${extra} AND ${notAdmin(`x.${who}`)})::text`;
  return `WITH ${adminCte(adm)},
     spend AS (
       SELECT COALESCE(sum(d.amount), 0) AS energy,
              count(DISTINCT d.account_id) AS active,
              COALESCE(sum(d.n) FILTER (WHERE d.reason = 'step'), 0) AS steps,
              COALESCE(sum(d.n) FILTER (WHERE d.reason = 'decor'), 0) AS gathered
         FROM yuplink.energy_spend_daily d
        WHERE ${windowSql("d.day", fromIso, toIso, "::date")} AND ${notAdmin("d.account_id")}
     ),
     runs AS (
       SELECT count(*) AS fights, count(*) FILTER (WHERE x.killed) AS wins
         FROM yuplink.beta_raid_object_run x
        WHERE ${at("x.created_at")} AND ${notAdmin("x.account_id")}
     ),
     res AS (
       SELECT COALESCE(sum(r.amount) FILTER (WHERE r.resource = 'gold'), 0) AS gold,
              COALESCE(sum(r.amount) FILTER (WHERE r.resource = 'diamonds'), 0) AS diamonds
         FROM yuplink.account_resources r
        WHERE ${notAdmin("r.account_id")}
     )
SELECT spend.active::text,
       ${count("accounts", "created_at", "id")} AS new_players,
       spend.steps::text, spend.energy::text, spend.gathered::text,
       runs.fights::text, runs.wins::text,
       ${count("raid_mine_capture_log", "seized_at", "new_account", " AND x.kind = 'capture'")} AS mines,
       ${count("raid_tree_plant_op", "at", "account_id")} AS planted,
       ${count("raid_land_place_op", "created_at", "account_id")} AS land,
       ${count("raid_dynamite_op", "created_at", "account_id")} AS dynamite,
       res.gold::text, res.diamonds::text,
       (SELECT COALESCE(sum(l.delta), 0) FROM yuplink.acc_ledger l
         WHERE l.token = 'Darai' AND ${notAdmin("l.account_id")})::text AS darai
  FROM spend, runs, res`;
}

/** Лидеры всех досок: (board, account_id, v) — первые `limit` на доску. */
export function leadersSql(
  fromIso: string,
  toIso: string | null,
  adm: AdminLists,
  limit: number,
): string {
  const at = (col: string) => windowSql(col, fromIso, toIso);
  const spend = (board: string, reason: string) =>
    `SELECT '${board}' AS board, s.account_id, sum(s.n) AS v FROM spend s
      WHERE s.reason = '${reason}' GROUP BY s.account_id`;
  return `WITH ${adminCte(adm)},
     spend AS (
       SELECT d.account_id, d.reason, d.amount, d.n
         FROM yuplink.energy_spend_daily d
        WHERE ${windowSql("d.day", fromIso, toIso, "::date")} AND ${notAdmin("d.account_id")}
     ),
     boards AS (
       ${spend("steps", "step")}
       UNION ALL ${spend("gathered", "decor")}
       UNION ALL SELECT 'energy', s.account_id, sum(s.amount) FROM spend s GROUP BY s.account_id
       UNION ALL SELECT 'fights', x.account_id, count(*) FROM yuplink.beta_raid_object_run x
                  WHERE ${at("x.created_at")} AND ${notAdmin("x.account_id")} GROUP BY x.account_id
       UNION ALL SELECT 'mines', x.new_account, count(*) FROM yuplink.raid_mine_capture_log x
                  WHERE ${at("x.seized_at")} AND x.kind = 'capture' AND ${notAdmin("x.new_account")}
                  GROUP BY x.new_account
       UNION ALL SELECT r.resource, r.account_id, r.amount FROM yuplink.account_resources r
                  WHERE r.resource IN ('gold', 'diamonds', 'wood', 'stone') AND ${notAdmin("r.account_id")}
       UNION ALL SELECT 'darai', l.account_id, sum(l.delta) FROM yuplink.acc_ledger l
                  WHERE l.token = 'Darai' AND ${notAdmin("l.account_id")} GROUP BY l.account_id
     ),
     ranked AS (
       SELECT b.board, b.account_id, b.v,
              row_number() OVER (PARTITION BY b.board ORDER BY b.v DESC, b.account_id) AS rn
         FROM boards b
        WHERE b.v > 0 AND b.account_id IS NOT NULL
     )
SELECT board, account_id, floor(v)::text AS v FROM ranked WHERE rn <= ${Math.floor(limit)}
 ORDER BY board, rn`;
}

/** Герой, которым играет аккаунт (последний выбранный): имя и лицо — вместо ника. */
export function heroesSql(accountIds: string[]): string {
  return `SELECT DISTINCT ON (h.account_id) h.account_id, t.name, t.image_url AS image
    FROM yuplink.hero_instance h
    JOIN yuplink.mystic_item_template t ON t.id = h.template_id
   WHERE h.account_id IN (${accountIds.map(sqlStr).join(", ")}) AND t.name IS NOT NULL
   ORDER BY h.account_id, h.selected_at DESC NULLS LAST`;
}

/**
 * События окна для газеты: монстр, которого чаще всех побеждали (бои с
 * объектами карты — шаблоны боссов/мобов), и декор, который чаще всех рубили
 * (отметки отрастания: строка на клетку, повторная рубка той же клетки её
 * переписывает — счёт снизу, для «чаще всех» годится).
 */
export function highlightsSql(fromIso: string, toIso: string | null, adm: AdminLists): string {
  const at = (col: string) => windowSql(col, fromIso, toIso);
  return `WITH ${adminCte(adm)},
     mon AS (
       SELECT 'monster' AS kind, b.name, b.image_url AS image, count(*) AS n
         FROM yuplink.beta_raid_object_run x
         JOIN yuplink.raid_boss_template b ON b.id = x.object_id
        WHERE ${at("x.created_at")} AND ${notAdmin("x.account_id")}
        GROUP BY b.id, b.name, b.image_url
        ORDER BY n DESC, b.id LIMIT 1
     ),
     chop AS (
       SELECT 'decor' AS kind, t.name, t.image_url AS image, count(*) AS n
         FROM yuplink.raid_decor_respawn x
         JOIN yuplink.mystic_item_template t ON t.id = x.decor_id
        WHERE ${at("x.created_at")}
        GROUP BY t.id, t.name, t.image_url
        ORDER BY n DESC, t.id LIMIT 1
     )
SELECT kind, name, image, n::text AS n FROM mon
UNION ALL SELECT kind, name, image, n::text FROM chop`;
}
