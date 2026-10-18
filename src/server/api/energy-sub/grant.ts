// Выдача дней подписки: наступивший день → подарки «энергия» и «бокс».
//
// Без крона: день выдаётся, когда игрок открывает подарки или витрину (и сразу
// после покупки). Подарки опрашиваются раз в минуту у каждого на карте, поэтому
// процесс помнит, когда у аккаунта наступит следующий день, и до того в базу
// не ходит; подписок нет — перепроверка раз в 5 минут (купленную на соседнем
// воркере подписку день 1 уже выдала сама покупка).
//
// Подарок дня ждёт сутки от НАЧАЛА дня (владелец, 29.09: забрать день в день).
// День, которого игрок не видел сутки, записывается пропущенным, как сгорел
// бы подарок, выданный кроном вовремя.
//
// День и его подарки — ОДИН запрос: записать «день N выдан» и потерять
// подарки при обрыве связи нельзя. Повтор упирается в PRIMARY KEY (sub_id,
// day_no) и ничего не выдаёт второй раз.
// Заметка подарка — «esub:Эксперт|Expert»: окно подарков покажет по языку.
//
// Энергия подписки после получения тает, как любой подарок (gifts-deliver.ts:
// вид energy_admin, в журнале — ref «esub:<подарок>»).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { DAY_TTL_HOURS } from "@/lib/energySub";

/** Метка в ref_id подарка-энергии: энергия подписки (учёт в журнале по ref). */
export const SUB_ENERGY_MARK = "esub";

export const grantSql = (account: string) => `
WITH due AS (
  SELECT s.id, s.account_id, s.energy_per_day, s.box_pack_id, s.boxes_per_day,
         s.tier_name, COALESCE(t.name_en, s.tier_name) AS tier_en, d.day_no,
         s.starts_at + (d.day_no - 1) * interval '1 day' AS day_at,
         p.name AS box_name, p.cover_image_url AS box_image
    FROM yuplink.energy_sub s
    LEFT JOIN yuplink.energy_sub_tier t ON t.id = s.tier_id
    LEFT JOIN yuplink.chip_packs p ON p.id = s.box_pack_id
    CROSS JOIN LATERAL generate_series(1, s.days) AS d(day_no)
   WHERE s.account_id = ${sqlStr(account)}
     AND s.starts_at + (d.day_no - 1) * interval '1 day' <= now()
     AND NOT EXISTS (SELECT 1 FROM yuplink.energy_sub_day x
                      WHERE x.sub_id = s.id AND x.day_no = d.day_no)
   ORDER BY s.id, d.day_no
   LIMIT 400
), ins AS (
  INSERT INTO yuplink.energy_sub_day (sub_id, day_no, energy, boxes, missed)
  SELECT id, day_no, energy_per_day, boxes_per_day,
         day_at + interval '${DAY_TTL_HOURS} hours' <= now()
    FROM due
  ON CONFLICT DO NOTHING
  RETURNING sub_id, day_no, missed
), gifts AS (
  INSERT INTO yuplink.player_gift
    (id, account_id, kind, amount, ref_id, title, image, note, status, source_ref,
     created_by, expires_at)
  SELECT 'gft_' || substr(md5(i.sub_id || ':' || i.day_no || ':' || k.kind), 1, 12),
         d.account_id, k.kind, k.amount, k.ref_id, k.title, k.image,
         'esub:' || d.tier_name || '|' || d.tier_en, 'pending',
         'esub:' || i.sub_id || ':d' || i.day_no || ':' || k.kind, 'esub',
         d.day_at + interval '${DAY_TTL_HOURS} hours'
    FROM ins i
    JOIN due d ON d.id = i.sub_id AND d.day_no = i.day_no
    CROSS JOIN LATERAL (VALUES
      ('energy', d.energy_per_day::numeric, 'esub'::text, NULL::text, NULL::text),
      ('pack', d.boxes_per_day::numeric, d.box_pack_id, d.box_name, d.box_image)
    ) AS k(kind, amount, ref_id, title, image)
   WHERE NOT i.missed AND k.amount > 0 AND k.ref_id IS NOT NULL
  ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
  RETURNING id
), nxt AS (
  -- начало следующего ещё не наступившего дня среди подписок аккаунта
  SELECT min(s.starts_at + (floor(extract(epoch FROM now() - s.starts_at) / 86400)::int + 1)
                           * interval '1 day') AS at
    FROM yuplink.energy_sub s
   WHERE s.account_id = ${sqlStr(account)}
     AND floor(extract(epoch FROM now() - s.starts_at) / 86400)::int + 2 <= s.days
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM ins)::int AS days,
         (SELECT count(*) FROM ins WHERE missed)::int AS missed,
         (SELECT count(*) FROM gifts)::int AS gifts,
         (SELECT (extract(epoch FROM at) * 1000)::bigint FROM nxt) AS next_ms
) _t;`;

type GrantRow = { days: number; missed: number; gifts: number };

/** Ответ моста бывает `[{_row}]` или сразу `[{…}]` — разворачиваем обе формы. */
export function firstRow<T>(rows: unknown): T | null {
  const raw = (rows as Array<Record<string, unknown>> | null)?.[0];
  if (!raw || typeof raw !== "object") return null;
  return ("_row" in raw ? raw._row : raw) as T;
}

/** Аккаунт → раньше какого момента выдавать нечего (мс). */
const nextGrantAt = new Map<string, number>();
const NO_SUB_RECHECK_MS = 5 * 60_000;

/**
 * Выдать все наступившие дни подписок аккаунта. Безопасно звать сколько
 * угодно раз: выданный день второй раз не выдаётся. force — мимо памяти
 * процесса (покупка: подписка только что появилась).
 */
export async function grantDueForAccount(account: string, opts: { force?: boolean } = {}): Promise<GrantRow> {
  const now = Date.now();
  if (!opts.force && (nextGrantAt.get(account) ?? 0) > now) return { days: 0, missed: 0, gifts: 0 };
  // БЕЗ обёртки wrapJson: изменяющие CTE обязаны стоять на верхнем уровне.
  const rows = await mcpExec(grantSql(account));
  const r = firstRow<GrantRow & { next_ms: number | string | null }>(rows);
  const next = Number(r?.next_ms);
  nextGrantAt.set(account, next > 0 ? next : now + NO_SUB_RECHECK_MS);
  return { days: Number(r?.days) || 0, missed: Number(r?.missed) || 0, gifts: Number(r?.gifts) || 0 };
}
