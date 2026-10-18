// Оплата и возврат АРТЕФАКТОМ. Отдельный модуль по той же причине, по которой
// артефакты вообще выбиваются из ряда предметных цен: они не рюкзачные. Стек
// рюкзака (пак/босс/кастом) знает только «сколько штук», артефакт же — штучная
// строка инвентаря со своим id, которую можно надеть на героя. Значит и
// списание, и откат работают с экземплярами, а не с числом.
import type { SpendReceipt, SpendPick } from "./market-money";

/**
 * Оплата АРТЕФАКТОМ. token — либо конкретный шаблон, либо псевдо-«любой арт
 * редкости X» (art_any_*). Игрок мог ткнуть в конкретный (pick) — тогда
 * проверяем, что он его и что редкость та, которую просит витрина: иначе за
 * «любой обычный» уходил бы легендарный.
 */
export async function spendArt(
  wallet: string,
  account: string,
  token: string,
  amount: number,
  ref: string,
  pick?: SpendPick,
): Promise<SpendReceipt> {
  // Штучный предмет дробями не считается — половину артефакта отдать нечем.
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("market.bad_qty");
  const { isArtAny, artAnyRarity } = await import("./art-rarity");
  const { takeArtifacts, freeArtifactStat } = await import("./art-stock");
  const rarity = isArtAny(token) ? artAnyRarity(token) : null;
  // У витрины «любой арт редкости X» шаблон выбирает игрок; у именной позиции
  // он задан самой позицией, и выбирать нечего.
  const chosen = rarity ? pick?.artTemplateId?.trim() || null : token;
  if (rarity && chosen) {
    // Выбор игрока приходит с клиента — значит проверяем и владение, и
    // редкость. Иначе за «любой обычный» ушёл бы легендарный.
    const stat = await freeArtifactStat(account, chosen);
    if (!stat || stat.count < amount) throw new Error("market.art_rarity_none");
    if (stat.rarity !== rarity) throw new Error("market.art_rarity_wrong");
  }
  const arts = await takeArtifacts({
    account,
    wallet,
    qty: amount,
    pick: { templateId: chosen, rarity },
    op: ref,
  });
  // Отказ объясняем по существу позиции: у «любого арта редкости X» виноват
  // запас этой редкости, у именной — конкретный шаблон. Один текст на оба
  // случая уверял игрока, будто дело в редкости, которой позиция не задавала.
  if (!arts) throw new Error(rarity ? "market.art_rarity_none" : "market.art_named_none");
  return { paidArts: arts };
}

/** Вернуть/выдать артефакты в инвентарь. Квитанция есть → ровно те же штуки. */
export async function creditArt(
  wallet: string,
  account: string,
  token: string,
  amount: number,
  ref: string,
  receipt?: SpendReceipt,
): Promise<void> {
  const { restoreArtifacts, grantArtifacts } = await import("./art-stock");
  if (receipt?.paidArts?.length) {
    // Возвращаем РОВНО столько экземпляров, сколько просят: при частичной
    // выплате (магазин недодал паков) назад едет только доля товара. Вернуть
    // всё — значит отдать игроку и артефакты, и то, что уже заплачено.
    const n = Math.min(receipt.paidArts.length, Math.max(0, Math.round(amount)));
    await restoreArtifacts({ wallet, account, arts: receipt.paidArts.slice(0, n) });
    return;
  }
  const { isArtAny, artAnyRarity, pickArtTemplateByRarity } = await import("./art-rarity");
  // Псевдо-шаблон «любой арт редкости X» в инвентарь не положишь — резолвим в
  // настоящий, иначе строка ссылалась бы на несуществующий шаблон.
  const templateId = isArtAny(token)
    ? (await pickArtTemplateByRarity(artAnyRarity(token)!)).id
    : token;
  // Ключ выдачи — из ref сделки: слепой повтор запроса не начеканит вторую пачку.
  const want = Math.max(0, Math.floor(amount));
  const granted = await grantArtifacts({
    wallet,
    account,
    templateId,
    qty: want,
    nonce: `cr${refKey(ref)}`,
  });
  // Это путь ВОЗВРАТА (квитанции нет — значит откат «арта по редкости»).
  // Недодали — молчать нельзя: артефакт уже забран, и тишина оставила бы игрока
  // без вещи и без денег. Бросок поднимает алерт админам (market-undo-alert).
  if (granted < want) throw new Error("market.give_failed");
}

/**
 * Ref сделки в вид, годный для id строки. Не хеш: 32-битный хеш когда-нибудь
 * совпал бы у двух разных сделок, и вторая выдача тихо пропала бы на
 * ON CONFLICT DO NOTHING. Хвост в 40 символов уносит nonce — уникальную часть.
 */
function refKey(ref: string): string {
  return ref.replace(/[^A-Za-z0-9_-]/g, "").slice(-40);
}
