// Куда падает урожай грядки: ресурс — на счёт, товар — в рюкзак героя.
//
// Отдельным модулем от field.ts (лимит ≤250 строк) и потому, что это ровно та
// развилка, о которой просил владелец: поле умеет растить не только золото со
// счёта, но и «свою пшеницу» из справочника товаров.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { nanoid } from "nanoid";
import {
  resolveBackpack,
  depositToBackpack,
  assertBackpackRoom,
  stackKeyFor,
} from "./market-backpack";
import type { FieldReward } from "@/lib/fieldConfig";
import type { MarketItem } from "@/lib/marketItem";
import { isRewardResource } from "@/lib/rewardKinds";
import { goldForEarnedTickets } from "@/lib/ticketGold";

export async function giveFieldReward(opts: {
  wallet: string;
  account: string;
  reward: FieldReward;
  units: number;
  ref: string;
  /** op-ключ идемпотентности: без него likes/tickets (нет дедупа по ref в
   *  raid_mine_credit) удвоились бы на слепом ретрае моста. */
  nonce: string;
}): Promise<void> {
  const { wallet, account, reward, units, ref, nonce } = opts;
  if (units <= 0) return;

  if (reward.kind === "resource") {
    // Золото/камень/дерево/алмазы — в журнал счёта своим видом 'field': через
    // шахтную функцию урожай ложился видом 'mine' и не отличался от шахты
    // (владелец 28.09: «поля и шахты — отдельная разметка»). Прочее (лайки,
    // билеты, энергия, токен) — прежним путём: у энергии вид решает таяние
    // (ПРАВИЛА §8.6.1), у Darai — пул карты. Билетов нет (§8.61): грядка
    // «билетов» растит золото — 100 за билет, тем же видом 'field'.
    const tix = reward.resource === "tickets";
    const res = tix ? "gold" : reward.resource;
    const qty = tix ? goldForEarnedTickets(units) : units;
    const credit = isRewardResource(res)
      ? `yuplink.res_move(${sqlStr(account)}, ${sqlStr(res)}, ${qty}, 'field',
              ${sqlStr(ref)})`
      : `yuplink.raid_mine_credit(${sqlStr(account)}, ${sqlStr(wallet)},
              ${sqlStr(reward.resource)}, ${reward.token ? sqlStr(reward.token) : "NULL"},
              ${units}, ${sqlStr(ref)})`;
    // Кредит выполняем ТОЛЬКО если op-ключ лёг в журнал первым — повтор
    // потерянного ответа видит ключ занятым и на счёт второй раз не зачислит.
    await mcpExec(
      `WITH claim AS (
         INSERT INTO yuplink.raid_field_op (op) VALUES (${sqlStr(`fr:${nonce}`)})
         ON CONFLICT (op) DO NOTHING RETURNING 1
       )
       SELECT ${credit}
         FROM claim;`,
    );
    return;
  }

  // Товар кладётся в рюкзак ВЫБРАННОГО героя — тем же стеком, что и покупки в
  // маркете, поэтому «двадцать на ячейку» считается одинаково.
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.backpack_no_hero");
  const item = {
    id: reward.itemId,
    kind: "custom",
    refId: reward.itemId,
    name: reward.name,
    image: reward.image,
  } as unknown as MarketItem;
  await assertBackpackRoom(bp, await stackKeyFor(item), units);
  await depositToBackpack({
    heroId: bp.heroId,
    account,
    item,
    qty: units,
    nonce: nanoid(10),
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
    // Урожай грядки (stack-origin): метка «с грядок» — собранное, годится в сундук.
    origin: "field",
  });
}
