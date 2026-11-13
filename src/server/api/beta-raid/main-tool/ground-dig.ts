// «Копать» где угодно (владелец, 29.09.2026; ПРАВИЛА §8.24): с лопатой в руках
// можно копать любую клетку, где можно стоять, — вплотную (своя или соседняя).
// 2 энергии и износ лопаты; с 31.10 — находка по списку долей (п. 6б):
// случайный бросок (dig-seed) по списку местности клетки (dig-finds-config),
// выкопанное — мешочком в ямке (dig-find): «нужно открывать самому, за
// энергию». Клетку держит ямка (час): на ней только «Закопать» (hole-bury);
// ямка исчезла — клетка снова даёт шанс (12.11.2026). На острове новичка копка всегда «ничего».
// Клад дня (§8.117, api/treasure): на его клетке копка достаёт клад — первому,
// кто забрал клетку ямкой; обычной находки тогда нет («из одной копки — один приз»).
//
// Порядок как у «Закопать» мешочка (bag-dig): проверки → 2 энергии (§8.23,
// bag-dig-pay) → износ лопаты в руках (ключ удара от ключа нажатия: повтор его
// второй раз не снимет) → ключ нажатия 'done'. Ключ не записался — «забор»
// ключа ('failed' под локом): не записалось — энергия и износ назад; повтор
// нажатия отвечает прежним исходом и второй раз не платит.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor, requireBagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { NEED_SHOVEL, chargeShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { payDig } from "@/server/api/beta-raid/loot-bag/bag-dig-pay";
import { publishRaid } from "@/server/raidLive";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { digListFor, pickDigFind } from "@/lib/raid/digFinds";
import { loadDigConfig } from "@/server/api/beta-raid/main-tool/dig-finds-config";
import { digRoll } from "@/server/api/beta-raid/main-tool/dig-seed";
import { giveFind } from "@/server/api/beta-raid/main-tool/dig-find";
import { bumpAchievement } from "@/server/api/achievements/bump";
import {
  liveTreasureAt,
  settleTreasure,
  type TreasureGot,
} from "@/server/api/treasure/treasure-pay";
import {
  CANT_DIG,
  DUG_HERE,
  groundCellSql,
  groundFenceSql,
  groundMarkSql,
} from "@/server/api/beta-raid/main-tool/ground-dig-sql";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия не копает второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

/** Ответ: нашлось ли (1 — мешочек в ямке; что внутри — при «Открыть») и клад. */
export type GroundDig = { ok: true; found: number; treasure?: TreasureGot | null };

/** Прежний исход нажатия (ответ потерялся) — свежим чтением ключа. */
async function opState(op: string): Promise<{ state: string; item: string | null } | null> {
  const rows = (await mcpExec(
    `SELECT state, parts->>'item' AS item FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`,
    { wrapJson: true },
  )) as Array<{ state: string; item: string | null }>;
  const row = rows?.[0];
  return row ? { state: row.state, item: row.item ?? null } : null;
}

/** Можно ли копать клетку: нет строки или ok = false — нельзя; ямка — «уже копали». */
async function requireDiggable(mapId: string, q: number, r: number): Promise<string | null> {
  const rows = (await mcpExec(groundCellSql({ mapId, q, r }), { wrapJson: true })) as Array<{
    ok: boolean;
    hole: boolean;
    terrain: string | null;
  }>;
  const row = rows?.[0];
  if (row?.ok !== true) throw new Error(CANT_DIG);
  if (row.hole === true) throw new Error(DUG_HERE);
  return row.terrain ?? null;
}

export const digGround = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<GroundDig> => {
    const a = await bagActor("ground-dig");
    const op = `gdig:${a.account}:${data.op}`;
    const at = { op, account: a.account, mapId: a.mapId, q: data.q, r: data.r };
    // Мешочек роняет только записавший ключ (give — его nonce); повтор и дубль —
    // только ответ.
    // dug — на клетке был клад (или повтор нажатия: исход прежний, клад мог быть).
    const found = async (
      item: string | null,
      give: string | null,
      dug: boolean,
    ): Promise<GroundDig> => {
      if (item && give) await giveFind({ ...at, nonce: give, itemId: item });
      const treasure = dug ? await settleTreasure(op, a.wallet, a.account).catch(() => null) : null;
      // «Кладоискатель» (§8.57): выкопанное — мешочек с находкой или клад дня; пустая
      // копка — не клад. Только записавший ключ нажатия (give): повтор не считает.
      if (give && (item || treasure)) bumpAchievement(a.account, "digger");
      const res: GroundDig = { ok: true as const, found: item ? 1 : 0 };
      return treasure ? { ...res, treasure } : res;
    };
    // Повтор нажатия, чей ответ потерялся: тот же исход, без второго списания.
    const prior = await opState(op);
    if (prior?.state === "done") return found(prior.item, null, true);
    if (prior) throw new Error("bag.drop_failed");
    await requireBagNear(a, data.q, data.r);
    const terrain = await requireDiggable(a.mapId, data.q, data.r);
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error(NEED_SHOVEL);
    const island = isIslandMapId(a.mapId);
    const list = island ? [] : digListFor(await loadDigConfig(), terrain);
    // Не прочиталось — отказ до денег: молча копать «мимо» клада нельзя (ямка держала
    // бы клетку час, а клад ушёл бы следующему).
    const treasure = island ? null : await liveTreasureAt(a.mapId, data.q, data.r);
    const item = treasure ? null : pickDigFind(list, digRoll());
    const pay = await payDig(a.wallet, a.mapId);
    const tool = await chargeShovel(a.wallet, bp.heroId, op).catch(async (e: unknown) => {
      await pay.refund();
      throw e;
    });
    const nonce = nanoid(12);
    let row: { state: string | null; mine?: boolean | null; item?: string | null } | undefined;
    try {
      row = sqlRow(
        (await mcpExec(groundMarkSql({ ...at, nonce, item, treasureId: treasure }))) as unknown[],
      );
      // Ответ не разобрался — исход неизвестен так же, как при потерянном.
      if (!row) throw new Error("bag.drop_failed");
    } catch (e) {
      const fence = sqlRow<{ state: string; nonce: string | null; item: string | null }>(
        (await mcpExec(groundFenceSql(at))) as unknown[],
      );
      // Ключа нет — «забор» встал отказом: копки не было, износ и энергия назад.
      if (fence?.state !== "done") {
        await Promise.all([tool.back(), pay.refund()]);
        throw e;
      }
      // Записали мы — или параллельный дубль того же нажатия: находка — из ключа.
      row = { state: "done", mine: fence.nonce === nonce, item: fence.item ?? null };
    }
    if (row?.state !== "done") {
      await Promise.all([tool.back(), pay.refund()]);
      // Ключа нет и клетку не забрали — её только что вскопал другой.
      throw new Error(row && !row.state ? DUG_HERE : "bag.drop_failed");
    }
    // Ключ записал параллельный дубль того же нажатия — наша плата лишняя
    // (износ у них общий: ключ удара от нажатия).
    if (row.mine === false) await pay.refund();
    await tool.done();
    // Ямка встала той же записью — у всех, кто рядом, без F5.
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${data.q},${data.r}`] });
    return found(row.item ?? null, row.mine === false ? null : nonce, !!treasure);
  });
