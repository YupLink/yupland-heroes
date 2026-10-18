// «Закопать» и «Выкопать» сундук — обычный и магический (ПРАВИЛА §8.22).
//
// Только с лопатой, вплотную, износ лопаты — как у мешочка (bag-shovel →
// топорный износ §8.19). Закопанный сундук — бугорок: та же картинка и та же
// видимость, что у мешочка (круг 20, разведанное), но он не сгорает никогда;
// пока закопан — ни положить, ни забрать, ни «Забрать сундук», ни грабить.
// Выкопали — снова тот же сундук с тем же содержимым (в мешочек не
// превращается). Закопан может быть и пустой сундук.
//  • Обычный закапывает и выкапывает любой.
//  • Магический закапывает тоже любой (владелец, 30.09), но только без живой
//    охраны; выкапывает любой — по бугорку не видно, что под ним.
// Живой объект на клетке (босс воскрес поверх) — сначала бой, как у мешочка;
// декор вырос поверх бугорка (дополнение №5) — сначала рубка.
//
// Порядок — как у мешочка (bag-dig): проверки → 2 энергии (§8.23, payForHit) →
// износ лопаты (ключ удара от ключа нажатия) → переворот одним оператором
// (pchest-dig-sql). Не перевернулось — энергия и износ назад. Ответ потерялся —
// «забор» ключа: исход 'failed' под локом, и опоздавшая попытка уже ничего не
// перевернёт. Повтор нажатия — без второго списания (ключ нажатия).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { markDigHole } from "@/server/api/beta-raid/main-tool/dig-hole";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { loadChest, requireChestNear, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { guardAlive, loadGuardRow } from "@/server/api/beta-raid/mine-guard-read";
import { blockedAt, requireNotUnderBuilding } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { NEED_SHOVEL, chargeShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { payDig } from "@/server/api/beta-raid/loot-bag/bag-dig-pay";
import { loadOp, loadPlainChest, pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  flipFenceSql,
  flipSql,
  type FlipRow,
  type FlipTarget,
} from "@/server/api/beta-raid/plain-chest/pchest-dig-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия не копает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

type Actor = Awaited<ReturnType<typeof pchestActor>>;

/** Какой сундук на клетке и можно ли его перевернуть — отказ до лопаты. */
async function targetAt(a: Actor, q: number, r: number, bury: boolean): Promise<FlipTarget> {
  const plain = await loadPlainChest(a.mapId, q, r);
  const already = bury ? "pchest.buried" : "bag.not_buried";
  if (plain) {
    if (plain.buried === bury) throw new Error(already);
    return { kind: "plain", chestId: plain.id };
  }
  const magic = await loadChest(a.mapId, q, r);
  if (!magic) throw new Error(bury ? "pchest.gone" : "bag.not_buried");
  // С живой охраной закапывать нельзя — отказ до денег (оператор проверит ещё раз).
  if (bury && guardAlive(await loadGuardRow(a.mapId, q, r))) throw new Error("chest.guarded");
  if ((magic.buried === true) === bury) throw new Error(already);
  return { kind: "magic", mapId: a.mapId, q, r, owner: magic.owner_account };
}

async function flip(
  bury: boolean,
  data: z.infer<typeof input>,
): Promise<{ ok: true; buried: boolean }> {
  const a = await pchestActor(bury ? "chest-bury" : "chest-dig");
  const op = `${bury ? "pcbury" : "pcdig"}:${a.account}:${data.op}`;
  // Повтор нажатия, чей ответ потерялся: тот же исход, лопата второй раз не тратится.
  if ((await loadOp(op))?.state === "done") return { ok: true as const, buried: bury };
  await requireChestNear(a.wallet, a.mapId, data.q, data.r);
  // Живой объект — сначала бой, декор вырос поверх бугорка — сначала рубка.
  const blocked = await blockedAt(a.mapId, data.q, data.r);
  if (blocked) throw new Error(blocked);
  if (bury) await requireNotUnderBuilding(a.mapId, data.q, data.r);
  const target = await targetAt(a, data.q, data.r, bury);
  const bp = await resolveBackpack(a.wallet);
  if (!bp) throw new Error(NEED_SHOVEL);
  const pay = await payDig(a.wallet);
  const tool = await chargeShovel(a.wallet, bp.heroId, op).catch(async (e: unknown) => {
    await pay.refund();
    throw e;
  });

  const at = { target, op, account: a.account, bury };
  let row: FlipRow | undefined;
  try {
    row = sqlRow<FlipRow>((await mcpExec(flipSql({ ...at, nonce: nanoid(12) }))) as unknown[]);
  } catch (e) {
    // «Забор» не ответил — исход неизвестен: бросаем, износ и энергия остаются.
    const fence = sqlRow<{ state: string }>((await mcpExec(flipFenceSql(at))) as unknown[]);
    if (fence?.state !== "done") {
      await Promise.all([tool.back(), pay.refund()]);
      throw e;
    }
    row = { state: "done", here: true, buried: !bury, held: false, mine: true };
  }
  if (row?.state !== "done") {
    await Promise.all([tool.back(), pay.refund()]);
    if (row?.here !== true) throw new Error(bury ? "pchest.gone" : "bag.not_buried");
    if (bury && row.held === true) throw new Error("chest.guarded");
    throw new Error(bury ? "pchest.buried" : "bag.not_buried");
  }
  // Переворот записал параллельный повтор того же нажатия — наша плата лишняя.
  // Износ у них общий (ключ удара от нажатия), его не трогаем.
  if (row.mine === false) await pay.refund();
  await tool.done();
  // Выкопали — на клетке ямка на час (02.10); видна, когда сундук уйдёт.
  if (!bury) await markDigHole({ mapId: a.mapId, q: data.q, r: data.r });
  // Сундук ушёл в бугорок (или вернулся): слой сундуков — всем, бугорки — рядом.
  const cell = `${data.q},${data.r}`;
  publishRaid({ mapId: a.mapId, type: "built", cells: [cell] });
  publishRaid({ mapId: a.mapId, type: "bags", cells: [cell] });
  return { ok: true as const, buried: bury };
}

export const buryChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(({ data }) => flip(true, data));

export const digChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(({ data }) => flip(false, data));
