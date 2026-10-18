// SQL писем на весь экран — чистые сборщики строк (без доступа к базе), чтобы
// выборку и запись можно было проверить тестом по тексту и вживую одним SELECT.
//
// Таблицы — migrations/letter-01-player-letter.sql: player_letter (письмо,
// кому: 'all' или 'list' + accounts) и player_letter_seen (кто нажал
// «Понятно»). Прочитанное письмо игроку больше не приходит. Английская версия
// и «показывать до» — letter-02-en-until.sql.
import { sqlStr } from "../raid-shared";
import type { LetterAudience } from "@/lib/letters";

/** Писем за один вход — с запасом: их показывают по одному. */
export const MY_LETTERS_LIMIT = 20;

/** text[] литералом: ARRAY['a','b']::text[] (пустой — '{}'::text[]). */
export const textArray = (items: readonly string[]): string =>
  items.length ? `ARRAY[${items.map(sqlStr).join(",")}]::text[]` : `'{}'::text[]`;

/** Условие «письмо адресовано аккаунту»: всем или он в списке. */
const addressedTo = (acc: string) => `(l.audience = 'all' OR ${acc} = ANY(l.accounts))`;

/**
 * Мои письма при входе в игру: включённые, не истёкшие, адресованные мне и ещё
 * не прочитанные мной. Старые первыми — читаются по порядку объявления.
 * Срок вышел — письмо не приходит и тем, кто его так и не видел: объявление о
 * закончившемся турнире — уже неправда.
 */
export function myLettersSql(account: string): string {
  const acc = sqlStr(account);
  return `SELECT l.id, l.title, l.body, l.image, l.title_en, l.body_en
     FROM yuplink.player_letter l
    WHERE l.active
      AND (l.show_until IS NULL OR l.show_until > now())
      AND ${addressedTo(acc)}
      AND NOT EXISTS (SELECT 1 FROM yuplink.player_letter_seen s
                       WHERE s.letter_id = l.id AND s.account_id = ${acc})
    ORDER BY l.created_at, l.id
    LIMIT ${MY_LETTERS_LIMIT}`;
}

/**
 * «Понятно»: отметка о прочтении. Только для существующего письма, адресованного
 * мне; повтор (двойной тап, ретрай транспорта) — ничего не меняет.
 */
export function markSeenSql(id: string, account: string): string {
  const acc = sqlStr(account);
  return `INSERT INTO yuplink.player_letter_seen (letter_id, account_id)
   SELECT l.id, ${acc} FROM yuplink.player_letter l
    WHERE l.id = ${sqlStr(id)} AND ${addressedTo(acc)}
   ON CONFLICT (letter_id, account_id) DO NOTHING;`;
}

/** Список для админки: свежие первыми, со счётчиком прочитавших. */
export function adminLettersSql(): string {
  return `SELECT l.id, l.title, l.body, l.image, l.title_en, l.body_en,
          l.audience, l.accounts, l.active,
          extract(epoch from l.created_at) * 1000 AS created_ms,
          extract(epoch from l.show_until) * 1000 AS until_ms,
          (SELECT count(*) FROM yuplink.player_letter_seen s WHERE s.letter_id = l.id)::int AS seen
     FROM yuplink.player_letter l
    ORDER BY l.created_at DESC
    LIMIT 200`;
}

export type LetterFields = {
  title: string;
  body: string;
  titleEn: string | null;
  bodyEn: string | null;
  image: string | null;
  audience: LetterAudience;
  accounts: string[];
  /** ISO UTC; null — бессрочно. */
  showUntil: string | null;
};

const strOrNull = (v: string | null): string => (v ? sqlStr(v) : "NULL");

/** Создать письмо (включённым) или изменить существующее; RETURNING id. */
export function saveLetterSql(f: LetterFields, opts: { id?: string; newId: string; by: string }) {
  const v = {
    title: sqlStr(f.title),
    body: sqlStr(f.body),
    titleEn: strOrNull(f.titleEn),
    bodyEn: strOrNull(f.bodyEn),
    image: strOrNull(f.image),
    audience: sqlStr(f.audience),
    accounts: textArray(f.accounts),
    until: f.showUntil ? `${sqlStr(f.showUntil)}::timestamptz` : "NULL",
  };
  return opts.id
    ? `UPDATE yuplink.player_letter SET title = ${v.title}, body = ${v.body}, image = ${v.image},
              audience = ${v.audience}, accounts = ${v.accounts},
              title_en = ${v.titleEn}, body_en = ${v.bodyEn}, show_until = ${v.until}
        WHERE id = ${sqlStr(opts.id)} RETURNING id;`
    : `INSERT INTO yuplink.player_letter (id, title, body, image, audience, accounts, created_by,
              title_en, body_en, show_until)
       VALUES (${sqlStr(opts.newId)}, ${v.title}, ${v.body}, ${v.image}, ${v.audience},
               ${v.accounts}, ${sqlStr(opts.by)}, ${v.titleEn}, ${v.bodyEn}, ${v.until}) RETURNING id;`;
}

/** Сохранённое «показывать до» — узнать, что прошлую дату не меняли. */
export function letterUntilSql(id: string): string {
  return `SELECT extract(epoch from l.show_until) * 1000 AS until_ms
     FROM yuplink.player_letter l WHERE l.id = ${sqlStr(id)}`;
}

/** «Показать заново»: забыть, кто уже нажал «Понятно». */
export function forgetSeenSql(id: string): string {
  return `DELETE FROM yuplink.player_letter_seen WHERE letter_id = ${sqlStr(id)};`;
}

export function setActiveSql(id: string, active: boolean): string {
  return `UPDATE yuplink.player_letter SET active = ${active ? "true" : "false"}
    WHERE id = ${sqlStr(id)} RETURNING id;`;
}

/**
 * Записи списка «кому» → аккаунты. Админ пишет то, что знает: id аккаунта
 * (acc_…), Telegram-id или кошелёк. Неизвестная запись приходит с NULL.
 */
export function resolveAccountsSql(entries: readonly string[]): string {
  return `SELECT e.v AS entry,
          COALESCE(
            (SELECT a.id FROM yuplink.accounts a WHERE a.id = e.v LIMIT 1),
            (SELECT a.id FROM yuplink.accounts a WHERE a.telegram_id::text = e.v LIMIT 1),
            (SELECT u.account_id FROM yuplink.users u
              WHERE u.wallet IN (e.v, lower(e.v)) AND u.account_id IS NOT NULL LIMIT 1)
          ) AS account_id
     FROM unnest(${textArray(entries)}) WITH ORDINALITY AS e(v, n)
    ORDER BY e.n`;
}
