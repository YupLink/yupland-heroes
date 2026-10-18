// Артефакты игрока живут в ИНВЕНТАРЕ, а не в рюкзаке героя.
//
// ПОЧЕМУ отдельный модуль. Артефакт — это строка yuplink.user_game_item
// (kind='artifact'), а «надет» он тогда, когда его id упомянут в
// hero_instance.equipped. В рюкзаке героя (raid_hero_backpack) артефактов не
// бывает ВООБЩЕ — ни одной строки во всей базе. Маркет искал их именно там и
// отвечал «нет артефакта такой редкости» игроку со ста двадцатью артефактами
// в инвентаре.
//
// Здесь четыре операции маркета: показать свободные, атомарно снять ровно n
// штук, вернуть ровно те же экземпляры при откате и выдать новые при покупке.
// Надетое не трогаем никогда: продать снаряжение прямо с героя игрок не
// просил, а тихо раздеть его — худшее, что может сделать магазин.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { grantGameItems } from "./game-item-grant";
import { atText, recallTaken } from "./art-memo";

/** Экземпляр артефакта: строка инвентаря + шаблон, по которому он собран.
 *  obtainedAt — когда он к игроку попал: сервер берёт «самый старый свободный»,
 *  поэтому откат обязан вернуть артефакт на его место в очереди, а не в хвост. */
export type ArtRef = { id: string; templateId: string; obtainedAt?: string | null };

/** Шаблон в списке «что можно сдать»: одинаковые схлопнуты, count — свободные. */
export type SellableArt = {
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  count: number;
};

/** Чем ограничен выбор: редкостью, конкретным шаблоном или тем и другим. */
export type ArtPick = { rarity?: string | null; templateId?: string | null };

const int = (n: number): number => Math.max(0, Math.floor(Number(n) || 0));

/** Надетое ЭТИМ аккаунтом: значения hero_instance.equipped всех его героев. */
const wornSql = (account: string): string =>
  `SELECT e.value AS item_id
     FROM yuplink.hero_instance h, jsonb_each_text(h.equipped) e
    WHERE h.account_id = ${sqlStr(account)} AND h.equipped IS NOT NULL`;

/** Условие «свободный артефакт аккаунта» + сужение выбора. Без сужения — все. */
function freeSql(account: string, pick: ArtPick): string {
  const narrow = [
    pick.templateId ? `u.template_id = ${sqlStr(pick.templateId)}` : "",
    pick.rarity ? `t.rarity = ${sqlStr(pick.rarity)}` : "",
  ].filter(Boolean);
  return `FROM yuplink.user_game_item u
     JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    WHERE u.account_id = ${sqlStr(account)} AND u.kind = 'artifact'
      AND t.kind = 'artifact'
      ${narrow.length ? `AND ${narrow.join(" AND ")}` : ""}
      AND NOT EXISTS (SELECT 1 FROM worn w WHERE w.item_id = u.id)`;
}

/**
 * Свободные артефакты аккаунта, схлопнутые по шаблону. Это контракт пикера:
 * игрок сам решает, какой из ста обычных отдать, а не доверяет выбор серверу.
 *
 * Сбой запроса ЛЕТИТ НАВЕРХ, а не превращается в пустой список. Пустота здесь
 * — полноценный ответ («сдавать нечего»), и подмена ею отказа базы читалась
 * игроком как «арты не показываются»: клиент клал ложную пустоту в кэш на
 * полминуты, а повторить было нечего — бросать-то не бросали.
 */
export async function listFreeArtifacts(
  account: string,
  rarity?: string | null,
): Promise<SellableArt[]> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)})
     SELECT u.template_id AS "templateId", t.name, t.image_url AS "imageUrl", t.rarity,
            count(*)::int AS count
       ${freeSql(account, { rarity })}
      GROUP BY u.template_id, t.name, t.image_url, t.rarity
      ORDER BY t.name, u.template_id;`,
    { wrapJson: true },
  )) as SellableArt[];
  return (rows ?? []).map((r) => ({ ...r, count: int(r.count) }));
}

/** Редкость шаблона и сколько его СВОБОДНЫХ штук у аккаунта. null — чужой.
 *  Сбой запроса тоже летит наверх: null здесь означает «артефакт не твой», и
 *  выдавать это заключение по молчанию базы — врать игроку о его же вещах. */
export async function freeArtifactStat(
  account: string,
  templateId: string,
): Promise<{ rarity: string | null; count: number } | null> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)})
     SELECT t.rarity, count(*)::int AS count
       ${freeSql(account, { templateId })}
      GROUP BY t.rarity;`,
    { wrapJson: true },
  )) as Array<{ rarity: string | null; count: number }>;
  const row = rows?.[0];
  return row ? { rarity: row.rarity ?? null, count: int(row.count) } : null;
}

/**
 * Снять ровно qty свободных артефактов. ОДИН запрос: выбор кандидатов, заявка
 * в op-лог, удаление и памятка о том, что именно ушло.
 *
 * Почему так, а не «сначала выбрать, потом удалить»: две вкладки продали бы
 * один и тот же артефакт дважды. Здесь удаление и выбор — одно утверждение,
 * а второй игрок увидит уже удалённые строки и не спишет ничего.
 *
 * Мост к базе повторяет запрос ВСЛЕПУЮ. Заявка (op) не даст повтору снять
 * второй комплект, а памятка (op с перечнем экземпляров) позволяет повтору
 * ответить ТО ЖЕ САМОЕ — без неё удачное списание выглядело бы как «не хватает
 * артефактов», и игрок остался бы и без вещей, и без денег.
 *
 * null — свободных не набралось (надетые не считаются).
 */
export async function takeArtifacts(opts: {
  account: string;
  wallet: string;
  qty: number;
  pick: ArtPick;
  /** Ключ операции — уникальный на одну сделку (payRef). */
  op: string;
}): Promise<ArtRef[] | null> {
  const n = int(opts.qty);
  if (n <= 0) return [];
  const claimKey = `art:${opts.op}`;
  const memoPrefix = `${claimKey}#`;

  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(opts.account)}),
     free AS (
       SELECT u.id, u.template_id
         ${freeSql(opts.account, opts.pick)}
        ORDER BY u.obtained_at ASC, u.id ASC
        LIMIT ${n}
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${sqlStr(claimKey)} WHERE (SELECT count(*) FROM free) = ${n}
       ON CONFLICT (op) DO NOTHING
       RETURNING op
     ),
     gone AS (
       DELETE FROM yuplink.user_game_item d USING free f
        WHERE d.id = f.id AND EXISTS (SELECT 1 FROM claim)
       RETURNING d.id, d.template_id, d.obtained_at
     ),
     memo AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${sqlStr(memoPrefix)} || g.id || '=' || g.template_id
              || '=' || COALESCE(${atText("g.obtained_at")}, '')
         FROM gone g
       ON CONFLICT (op) DO NOTHING
     )
     SELECT g.id, g.template_id AS "templateId",
            ${atText("g.obtained_at")} AS "obtainedAt"
       FROM gone g;`,
  )) as ArtRef[];

  const taken = (rows ?? []).filter((r) => r?.id && r?.templateId);
  if (taken.length === n) return taken;
  // Ноль строк — либо не набралось свободных, либо это слепой повтор удачной
  // попытки: спрашиваем памятку, она и есть прошлый ответ.
  if (taken.length === 0) {
    const before = await recallTaken(memoPrefix);
    return before.length === n ? before : null;
  }
  // Взяли меньше, чем просили: часть экземпляров перехватила соседняя вкладка.
  // Сделки не будет — возвращаем взятое, иначе оно исчезло бы без оплаты.
  await restoreArtifacts({ wallet: opts.wallet, account: opts.account, arts: taken });
  return null;
}

/**
 * Вернуть в инвентарь ровно те же экземпляры — откат неудавшейся сделки.
 * Возвращаем под ИХ ЖЕ id: так откат идемпотентен (повтор ничего не удвоит), а
 * ссылки на предмет, если где-то остались, снова показывают на живую строку.
 *
 * И под их же obtained_at. Сервер платит «самым старым свободным» (ORDER BY
 * obtained_at), поэтому now() на возврате переставлял артефакт в конец очереди:
 * несостоявшаяся сделка меняла порядок инвентаря, и следующая покупка забирала
 * уже не тот экземпляр. Времени нет только у памяток, записанных до этой
 * правки, — там честнее now(), чем выдуманная дата.
 */
export async function restoreArtifacts(opts: {
  wallet: string;
  account: string;
  arts: ArtRef[];
}): Promise<void> {
  const arts = opts.arts.filter((a) => a?.id && a?.templateId);
  if (!arts.length) return;
  const values = arts
    .map(
      (a) =>
        `(${sqlStr(a.id)}, ${sqlStr(opts.wallet)}, ${sqlStr(opts.account)},
          ${sqlStr(a.templateId)}, 'artifact', 'market_undo',
          ${a.obtainedAt ? `${sqlStr(a.obtainedAt)}::timestamptz` : "now()"})`,
    )
    .join(",");
  await mcpExec(
    `INSERT INTO yuplink.user_game_item
       (id, wallet, account_id, template_id, kind, source, obtained_at)
     VALUES ${values}
     ON CONFLICT (id) DO NOTHING;`,
  );
}

/**
 * Выдать НОВЫЕ экземпляры шаблона — покупка артефакта и выплата артефактом.
 * Кладём в инвентарь, а не в рюкзак: только оттуда артефакт можно надеть и
 * потом сдать обратно. Сама вставка — в game-item-grant: id детерминированный
 * от nonce сделки, и та же формула обслуживает героев (слепой повтор запроса
 * не удвоит выдачу ни тем, ни другим).
 *
 * Возвращает, сколько штук реально оказалось у игрока: вызывающий отчитывается
 * о выдаче этим числом, а не запрошенным.
 */
export async function grantArtifacts(opts: {
  wallet: string;
  account: string;
  templateId: string;
  qty: number;
  nonce: string;
}): Promise<number> {
  return grantGameItems({ ...opts, kind: "artifact" });
}
