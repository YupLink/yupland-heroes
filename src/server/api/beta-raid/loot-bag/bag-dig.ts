// «Закопать» и «Выкопать» мешочек (ПРАВИЛА §8.21): любой игрок вплотную, у кого
// в рюкзаке есть лопата. Закопанный — бугорок: содержимое не видно и не
// забирается, всё сгорит через 24 ч после закапывания; выкопанный снова
// мешочек, сроки порций остаются от закапывания. Сгоревший бугорок не
// выкопать и лопатой.
//
// Порядок как у рубки декора инструментом (decor-interact): проверки → 2
// энергии (§8.23, bag-dig-pay) → износ лопаты (ключ удара от ключа нажатия —
// повтор не снимет второй раз) → переворот одним оператором под локом мешочка
// (digSql). Не перевернулось — энергия и износ назад. Сбой базы на перевороте —
// «забор» ключа (digFenceSql): исход 'failed' ставится под локом, опоздавшая
// попытка уже ничего не перевернёт; перевернулось — износ и энергия остаются,
// нет — возвращаются. Не ответил и «забор» — не возвращаем: лучше потерять
// удар лопаты, чем закопать даром. Повтор нажатия — без второго списания.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { publishRaid } from "@/server/raidLive";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  bagActor,
  bagNear,
  requireNotUnderBuilding,
} from "@/server/api/beta-raid/loot-bag/bag-actor";
import { digFenceSql, digSql, type DigRow } from "@/server/api/beta-raid/loot-bag/bag-dig-sql";
import { NEED_SHOVEL, chargeShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { payDig } from "@/server/api/beta-raid/loot-bag/bag-dig-pay";
import { markDigHole } from "@/server/api/beta-raid/main-tool/dig-hole";
import { requireNotOnMine } from "@/server/api/beta-raid/mine-dig-gate";
import { bumpDugBag } from "@/server/api/achievements/bump";

/** Прежний исход нажатия (ответ потерялся) — свежим чтением ключа. */
async function opState(op: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string }>;
  return rows?.[0]?.state ?? null;
}

const input = z.object({
  bagId: z.string().regex(/^lb_[0-9a-f]{32}$/),
  /** Ключ нажатия: повтор того же нажатия не копает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

async function flip(
  bury: boolean,
  data: z.infer<typeof input>,
): Promise<{ ok: true; buried: boolean; empty?: true }> {
  const a = await bagActor(bury ? "bag-bury" : "bag-dig");
  const op = `bag${bury ? "bury" : "dig"}:${a.account}:${data.op}`;
  // Повтор нажатия, чей ответ потерялся: тот же исход, без второго списания.
  if ((await opState(op)) === "done") return { ok: true as const, buried: bury };
  const bag = await bagNear(a, data.bagId);
  // Уже в нужном виде — отказ до денег и лопаты: за пустое нажатие не снимаем.
  if (bag.buried === bury) throw new Error(bury ? "bag.buried" : "bag.not_buried");
  // Шахта — ни закопать, ни выкопать (§8.59 п. 9); под прочим зданием — только выкопать.
  await requireNotOnMine(a.mapId, bag.q, bag.r);
  if (bury) await requireNotUnderBuilding(a.mapId, bag.q, bag.r);
  const bp = await resolveBackpack(a.wallet);
  if (!bp) throw new Error(NEED_SHOVEL);
  const pay = await payDig(a.wallet, a.mapId);
  const tool = await chargeShovel(a.wallet, bp.heroId, op).catch(async (e: unknown) => {
    await pay.refund();
    throw e;
  });
  const at = { bagId: bag.id, op, account: a.account, bury };
  let row: DigRow | undefined;
  try {
    row = sqlRow<DigRow>((await mcpExec(digSql({ ...at, nonce: nanoid(12) }))) as unknown[]);
  } catch (e) {
    // «Забор» не ответил — исход неизвестен: бросаем, износ остаётся.
    const fence = sqlRow<{ state: string }>((await mcpExec(digFenceSql(at))) as unknown[]);
    if (fence?.state !== "done") {
      await Promise.all([tool.back(), pay.refund()]);
      throw e;
    }
    row = { state: "done", alive: true, buried: !bury, busy: false, mine: true };
  }
  if (row?.state !== "done") {
    await Promise.all([tool.back(), pay.refund()]);
    if (row?.alive !== true) throw new Error("bag.gone");
    if (bury && row.buried === false && row.busy === true) throw new Error("bag.busy");
    throw new Error(bury ? "bag.buried" : "bag.not_buried");
  }
  // Переворот записал параллельный повтор того же нажатия — наша плата лишняя
  // (износ у них общий: ключ удара от нажатия).
  if (row.mine === false) await pay.refund();
  await tool.done();
  // Выкопали — на клетке ямка на час (02.10); видна, когда мешочек уйдёт.
  if (!bury) await markDigHole({ mapId: a.mapId, q: bag.q, r: bag.r });
  // Ачивка «Кладоискатель» (§8.57): своя попытка, не повтор чужого нажатия;
  // кучка из пустой ямки (§8.24 п. 6б) — не клад.
  if (!bury && row.mine !== false && row.empty !== true) bumpDugBag(a.account, bag.id);
  // Бугорок вместо мешочка (или наоборот) — у всех, кто рядом, без F5.
  publishRaid({ mapId: a.mapId, type: "bags", cells: [`${bag.q},${bag.r}`] });
  return {
    ok: true as const,
    buried: bury,
    ...(row.empty === true ? { empty: true as const } : {}),
  };
}

export const buryLootBag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(({ data }) => flip(true, data));

export const digLootBag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(({ data }) => flip(false, data));
