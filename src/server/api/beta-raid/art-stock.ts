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
import { enchantPctSql } from "./enchant/enchant-sql";
import {
  freeSql,
  freeTakeSql,
  int,
  wearSql,
  wornSql,
  type ArtPick,
  type ArtTake,
} from "./art-stock-sql";

export type { ArtPick, ArtTake };

/** Экземпляр артефакта: строка инвентаря + шаблон, по которому он собран.
 *  obtainedAt — когда он к игроку попал: сервер берёт «самый старый свободный»,
 *  поэтому откат обязан вернуть артефакт на его место в очереди, а не в хвост.
 *  wear — износ (lib/hero/artWear): откат возвращает предмет таким, каким взял. */
export type ArtRef = {
  id: string;
  templateId: string;
  obtainedAt?: string | null;
  wear?: number | null;
};

/** Шаблон в списке «что можно сдать»: одинаковые схлопнуты, count — свободные. */
export type SellableArt = {
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  count: number;
  /** Износ группы, %: разная прочность — разные строки (свои полосы). */
  wear: number;
  /** Зачарованных в группе (§8.87) и наибольший их процент; нет полей — ни одного. */
  enchanted?: number;
  enchantPct?: number;
};

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
  wear?: number | null,
): Promise<SellableArt[]> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)})
     SELECT u.template_id AS "templateId", t.name, t.image_url AS "imageUrl", t.rarity,
            count(*)::int AS count, u.wear::float8 AS wear,
            count(${enchantPctSql()})::int AS enchanted, max(${enchantPctSql()}) AS "enchantPct"
       ${freeSql(account, { rarity, wear })}
      GROUP BY u.template_id, t.name, t.image_url, t.rarity, u.wear
      ORDER BY t.name, u.template_id, u.wear;`,
    { wrapJson: true },
  )) as SellableArt[];
  return (rows ?? []).map(({ enchanted, enchantPct, ...r }) => ({
    ...r, count: int(r.count), wear: Number(r.wear) || 0,
    ...(int(enchanted ?? 0) > 0 ? { enchanted: int(enchanted ?? 0), enchantPct: Number(enchantPct) || 0 } : {}),
  }));
}

/** Редкость шаблона и сколько его СВОБОДНЫХ штук у аккаунта. null — чужой.
 *  Сбой запроса тоже летит наверх: null здесь означает «артефакт не твой», и
 *  выдавать это заключение по молчанию базы — врать игроку о его же вещах. */
export async function freeArtifactStat(
  account: string,
  templateId: string,
  wear?: number | null,
): Promise<{ rarity: string | null; count: number } | null> {
  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(account)})
     SELECT t.rarity, count(*)::int AS count
       ${freeSql(account, { templateId, wear })}
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
  const { account, wallet, op } = opts;
  return takeArtifactGroups({ account, wallet, op, groups: [{ pick: opts.pick, qty: opts.qty }] });
}

/**
 * То же снятие сразу по нескольким группам (шаблон + износ) — ломбард берёт
 * несколько артефактов одной сделкой (§8.73). Всё или ничего ОДНИМ запросом:
 * заявка встаёт, только если набрались ВСЕ группы целиком, ключ и памятка —
 * одни на сделку, как у одиночного снятия.
 */
export async function takeArtifactGroups(opts: {
  account: string;
  wallet: string;
  groups: ArtTake[];
  /** Ключ операции — уникальный на одну сделку (payRef). */
  op: string;
}): Promise<ArtRef[] | null> {
  const groups = opts.groups.filter((g) => int(g.qty) > 0);
  const n = groups.reduce((s, g) => s + int(g.qty), 0);
  if (n <= 0) return [];
  const claimKey = `art:${opts.op}`;
  const memoPrefix = `${claimKey}#`;

  const rows = (await mcpExec(
    `WITH worn AS (${wornSql(opts.account)}),
     free AS (
       ${freeTakeSql(opts.account, groups)}
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
       RETURNING d.id, d.template_id, d.obtained_at, d.wear
     ),
     memo AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${sqlStr(memoPrefix)} || g.id || '=' || g.template_id
              || '=' || COALESCE(${atText("g.obtained_at")}, '') || '=' || g.wear::text
         FROM gone g
       ON CONFLICT (op) DO NOTHING
     )
     SELECT g.id, g.template_id AS "templateId",
            ${atText("g.obtained_at")} AS "obtainedAt", g.wear::text AS wear
       FROM gone g;`,
  )) as ArtRef[];

  const taken = (rows ?? [])
    .filter((r) => r?.id && r?.templateId)
    .map((r) => ({ ...r, wear: Number(r.wear) || 0 }));
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
 * С их же износом: «починить» откатом нельзя (lib/hero/artWear).
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
          ${a.obtainedAt ? `${sqlStr(a.obtainedAt)}::timestamptz` : "now()"}, ${wearSql(a.wear)})`,
    )
    .join(",");
  await mcpExec(
    `INSERT INTO yuplink.user_game_item
       (id, wallet, account_id, template_id, kind, source, obtained_at, wear)
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
