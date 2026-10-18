// «Забрать сундук» (обычный) — любой игрок вплотную (ПРАВИЛА §8.22).
//
// Сундук ложится в рюкзак выбранного героя (одна ячейка, по всем правилам
// места); нет места — отказ с числами. Содержимое — в рюкзак, сколько влезет,
// остальное — мешочком на этой клетке (§8.21: 24 часа на порцию). Перед этим
// игрок видит цифры (getPlainPickup) и подтверждает их отпечатком sig: сундук
// общий, и между окном и нажатием его могли поменять — тогда pchest.confirm и
// окно показывает новые цифры. Пустой сундук забирается без подтверждения.
//
// План считается по снимку, запись одним оператором сверяет его с базой
// (pchest-pickup-sql): изменилось что-то между ними — план заново. Ключ
// нажатия: повтор того же нажатия отвечает итогом из ключа и второй раз ничего
// не пишет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import type { PlainPickupResult, PlainPickupView } from "@/lib/plainChest";
import type { ChestActor } from "@/server/api/beta-raid/chest/chest-row";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { resolveBackpack, type BackpackHero } from "@/server/api/beta-raid/market-backpack";
import { loadOp, pchestActor, plainNear } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { plainTarget } from "@/server/api/beta-raid/open-pass/pass-sql";
import { plainPlan, sigOf } from "@/server/api/beta-raid/plain-chest/pchest-pickup-plan";
import {
  pickupWriteSql,
  type PickupWriteRow,
} from "@/server/api/beta-raid/plain-chest/pchest-pickup-sql";
import {
  loadPlainSnap,
  pickupResultOf,
  announcePickup,
} from "@/server/api/beta-raid/plain-chest/pchest-pickup-read";

/** Сколько раз пересчитать план, если рюкзак или сундук менялись под рукой. */
const TRIES = 3;

const cellInput = z.object({ q: z.number().int(), r: z.number().int() });
const pickInput = cellInput.extend({
  /** Ключ нажатия: повтор того же нажатия не пишет второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  /** Отпечаток цифр, которые игрок видел и подтвердил. */
  sig: z.string().max(80).optional(),
});

/** Сундук рядом и рюкзак выбранного героя — общее начало обеих ручек. */
async function start(a: ChestActor, q: number, r: number) {
  const chest = await plainNear(a, q, r);
  const bp = await resolveBackpack(a.wallet);
  if (!bp) throw new Error("market.backpack_no_hero");
  return { chest, bp, at: { mapId: a.mapId, q, r, heroId: bp.heroId } };
}

/**
 * Снимок и план; сундука нет или он закопан — отказ причиной. С товаром — только
 * внутри оплаченного входа (§8.23): «Забрать сундук» уносит и содержимое.
 */
async function snapPlan(
  a: ChestActor,
  at: { mapId: string; q: number; r: number; heroId: string },
  bp: BackpackHero,
) {
  const snap = await loadPlainSnap(at);
  if (!snap.chest) throw new Error("pchest.gone");
  if (snap.chest.buried) throw new Error("pchest.buried");
  if (snap.slots.length > 0) await requirePass(a.account, plainTarget(snap.chest.id));
  return { snap, chest: snap.chest, plan: plainPlan(snap, bp) };
}

/** Цифры для подтверждения: что ляжет в рюкзак и что — мешочком. */
export const getPlainPickup = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cellInput.parse(d))
  .handler(async ({ data }): Promise<PlainPickupView> => {
    const a = await pchestActor(null);
    const { bp, at } = await start(a, data.q, data.r);
    const { snap, chest, plan } = await snapPlan(a, at, bp);
    return {
      fits: plan.fits,
      need: plan.need,
      free: plan.free,
      chest: { name: chest.name, image: chest.image },
      slots: snap.slots.map(({ stackKey, kind, refId, name, image, count }) => ({
        stackKey,
        kind,
        refId,
        name,
        image,
        count,
      })),
      taken: plan.taken,
      bagged: plan.bagged.map((b) => ({ stackKey: b.k, qty: b.n })),
      sig: sigOf(snap),
    };
  });

export const pickUpPlainChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pickInput.parse(d))
  .handler(async ({ data }): Promise<PlainPickupResult> => {
    const a = await pchestActor("pchest-pickup");
    const op = `pcpick:${a.account}:${data.op}`;
    // Повтор того же нажатия после коммита: сундука уже нет — итог из ключа.
    const done = pickupResultOf(await loadOp(op));
    if (done) {
      announcePickup(a, data, op, done, null);
      return done;
    }
    const { bp, at } = await start(a, data.q, data.r);

    for (let i = 0; i < TRIES; i++) {
      const { snap, chest, plan } = await snapPlan(a, at, bp);
      if (!plan.fits) throw new Error(`market.backpack_need:${plan.need}:${plan.free}`);
      // Сундук с товаром — только по цифрам, которые игрок видел.
      if (snap.slots.length > 0 && data.sig !== sigOf(snap)) throw new Error("pchest.confirm");
      const sql = pickupWriteSql({
        chestId: chest.id,
        heroId: bp.heroId,
        account: a.account,
        op,
        expect: { bagFp: snap.bagFp, slotFp: snap.slotFp },
        rows: plan.rows,
        taken: plan.taken,
        bagged: plan.bagged,
      });
      let res: PickupWriteRow | undefined;
      try {
        res = sqlRow<PickupWriteRow>((await mcpExec(sql)) as unknown[]);
      } catch (e) {
        // Ответ потерялся после коммита — судит ключ нажатия.
        const again = pickupResultOf(await loadOp(op).catch(() => null));
        if (!again) throw e;
        announcePickup(a, data, op, again, snap);
        return again;
      }
      if (!res || res.prior) {
        const again = pickupResultOf(await loadOp(op));
        if (!again) throw new Error(res ? "pchest.gone" : "chest.busy");
        announcePickup(a, data, op, again, snap);
        return again;
      }
      if (res.picked) {
        const out = {
          taken: plan.taken,
          bagged: plan.bagged.map((b) => ({ stackKey: b.k, qty: b.n })),
          bagId: res.bag_id ?? null,
        };
        announcePickup(a, data, op, out, snap);
        return out;
      }
      if (!res.here) throw new Error("pchest.gone");
      if (res.buried) throw new Error("pchest.buried");
      // Рюкзак или сундук поменялись под рукой — план заново.
    }
    throw new Error("chest.busy");
  });
