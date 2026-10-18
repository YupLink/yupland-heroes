// «Забрать сундук» (магический) — хозяин или чужой рядом с сундуком.
//
// Правила владельца (29.09.2026, четвёртая редакция и дополнение №3; ПРАВИЛА
// §8.15): хозяин забирает сундук в рюкзак выбранного героя (одна ячейка), и
// охрану — только целую, на полном HP: раненая исчезает, и хозяин видит это
// строкой в подтверждении (woundedOk). Нет места под сундук (и охрану) —
// отказ с числами. Чужой — когда живой охраны нет: сундук открепляется от сети
// хозяина, нет места — падает мешочком на клетке. Последний сундук хозяина
// уносит всю сеть — в рюкзак снимающего, сколько влезет, остальное — мешочком
// (§8.21); сеть пустеет. Перед этим игрок видит цифры (getChestPickup) и
// подтверждает их отпечатком sig. Сеть уезжает только внутри оплаченного
// входа (§8.23): «Забрать сундук» последнего — это и «забрать всё».
//
// План считается по снимку, запись одним оператором сверяет его с базой
// (chest-pickup-sql.ts): изменилось что-то между ними — план заново. Ключ
// нажатия op: повтор того же нажатия отвечает итогом из журнала и второй раз
// ничего не пишет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import type { ChestPickupResult, ChestPickupView } from "@/lib/magicChest";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { chestActor, chestNearAny, sqlRow, type ChestActor } from "@/server/api/beta-raid/chest/chest-row";
import { pickupPlan, sigOf, type PickupSnap } from "@/server/api/beta-raid/chest/chest-pickup-plan";
import { pickupSql, type PickupRes } from "@/server/api/beta-raid/chest/chest-pickup-sql";
import { loadPickupSnap, pickupDone, pickupItems } from "@/server/api/beta-raid/chest/chest-pickup-read";
import { announcePickup } from "@/server/api/beta-raid/chest/chest-pickup-note";
import { requirePass } from "@/server/api/beta-raid/open-pass/pass";
import { magicTarget } from "@/server/api/beta-raid/open-pass/pass-sql";

/** Сколько раз пересчитать план, если рюкзак или сеть менялись под рукой. */
const TRIES = 3;

const cellInput = z.object({ q: z.number().int(), r: z.number().int() });
const pickInput = cellInput.extend({
  /** Ключ нажатия: повтор того же нажатия не пишет второй раз. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  /** Игрок видел цифры и согласен. */
  confirm: z.boolean().optional(),
  /** Игрок видел «охрана ранена — не вернётся». Нет поля (старое окно) — как confirm. */
  woundedOk: z.boolean().optional(),
  /** Отпечаток цифр, которые игрок видел (нет — окно до выката: только хозяину). */
  sig: z.string().max(120).optional(),
});

/** Охрана стоит, но ранена — с сундуком не вернётся. */
const woundedOf = (snap: { guard: { whole: boolean } | null }): boolean =>
  !!snap.guard && !snap.guard.whole;

/** Цифры нужны: последний с товарами уносит сеть, чужому без места — сундук мешочком. */
const needsConfirm = (snap: PickupSnap, chestBagged: boolean): boolean =>
  (snap.last && snap.net.length > 0) || chestBagged;

/** Сундук рядом (свой или чужой без живой охраны) и рюкзак выбранного героя. */
async function pickupStart(a: ChestActor, q: number, r: number) {
  const { chest, mine } = await chestNearAny(a, q, r);
  const bp = await resolveBackpack(a.wallet);
  if (!bp) throw new Error("market.backpack_no_hero");
  const who = { mapId: a.mapId, q, r, owner: chest.owner_account, account: a.account, heroId: bp.heroId };
  return { bp, who, foreign: !mine };
}

/** Снимок и план; сундука нет — отказ; сеть уезжает только внутри входа (§8.23). */
async function snapPlan(a: ChestActor, s: Awaited<ReturnType<typeof pickupStart>>) {
  const snap = await loadPickupSnap(s.who);
  if (!snap.chest) throw new Error("chest.gone");
  if (s.foreign && snap.guarded) throw new Error("chest.guarded");
  if (snap.last && snap.net.length > 0) {
    await requirePass(a.account, magicTarget(a.mapId, s.who.q, s.who.r));
  }
  return { snap, plan: pickupPlan(snap, s.bp, s.foreign) };
}

/** Цифры для подтверждения: что ляжет в рюкзак и что — мешочком. */
export const getChestPickup = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cellInput.parse(d))
  .handler(async ({ data }): Promise<ChestPickupView> => {
    const a = await chestActor("chest-pickup-view");
    const start = await pickupStart(a, data.q, data.r);
    const { snap, plan } = await snapPlan(a, start);
    const g = start.foreign ? null : snap.guard;
    return {
      last: snap.last,
      chest: { name: snap.chest?.name ?? "", image: snap.chest?.image ?? null },
      guard: g?.whole ? { name: g.name, image: g.image } : null,
      guardWounded: !start.foreign && woundedOf(snap),
      foreign: start.foreign,
      chestBagged: plan.chestBagged,
      fits: plan.fits,
      need: plan.need,
      free: plan.free,
      // Сеть уезжает только у последнего (и только внутри входа) — иначе её
      // состав чужому не показываем: это было бы «Открыть» без платы.
      slots: snap.last
        ? snap.net.map(({ stackKey, kind, name, image, count }) => ({ stackKey, kind, name, image, count }))
        : [],
      taken: plan.taken,
      bagged: plan.left,
      lost: [],
      sig: sigOf(snap),
    };
  });

export const pickUpChest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pickInput.parse(d))
  .handler(async ({ data }): Promise<ChestPickupResult> => {
    const a = await chestActor("chest-pickup");
    const op = `chestpick:${a.account}:${data.op}`;
    // Повтор того же нажатия после коммита: сундука уже нет — итог из журнала.
    const replay = async (): Promise<ChestPickupResult | null> => {
      const done = await pickupDone(a.account, op);
      if (!done) return null;
      announcePickup(a, data, { op, owner: done.owner, res: done.result, items: done.items });
      return done.result;
    };
    const prior = await replay();
    if (prior) return prior;
    const start = await pickupStart(a, data.q, data.r);
    const { who, foreign } = start;
    const confirm = data.confirm === true;
    const woundedOk = data.woundedOk ?? confirm;

    for (let i = 0; i < TRIES; i++) {
      const { snap, plan } = await snapPlan(a, start);
      if (!plan.fits) throw new Error(`market.backpack_need:${plan.need}:${plan.free}`);
      // Цифры — ровно те, что игрок видел; окно до выката (без sig) — только хозяину.
      const seen = data.sig === undefined ? !foreign : data.sig === sigOf(snap);
      if (needsConfirm(snap, plan.chestBagged) && !(confirm && seen)) {
        throw new Error("chest.last_confirm");
      }
      // Раненая охрана пропадёт — сначала хозяин видит это в окне подтверждения.
      if (!foreign && woundedOf(snap) && !woundedOk) throw new Error("chest.last_confirm");

      const items = pickupItems(snap, { last: snap.last, foreign, chestBagged: plan.chestBagged });
      const sql = pickupSql({
        ...who,
        op,
        confirm,
        woundedOk,
        expect: {
          bagFp: snap.bagFp,
          netFp: snap.netFp,
          last: snap.last,
          tpl: snap.guard?.tpl ?? null,
          whole: snap.guard ? snap.guard.whole : null,
        },
        rows: plan.rows,
        bagged: plan.bagged,
        items,
        taken: plan.taken,
      });
      let res: PickupRes | undefined;
      try {
        res = sqlRow<PickupRes>((await mcpExec(sql)) as unknown[]);
      } catch (e) {
        // Ответ потерялся после коммита — судит журнал нажатия.
        const again = await replay().catch(() => null);
        if (!again) throw e;
        return again;
      }
      // Повтор моста после коммита (ключ уже стоит) или ответ не разобрался —
      // итог спрашиваем у журнала: он есть, только если запись прошла.
      if (!res || res.was) {
        const again = await replay();
        if (!again) throw new Error(res ? "chest.gone" : "chest.busy");
        return again;
      }
      if (res.picked) {
        const out: ChestPickupResult = {
          guard: !foreign && snap.guard?.whole === true,
          taken: plan.taken,
          bagged: plan.left,
          chestBagged: plan.chestBagged,
          lost: [],
        };
        announcePickup(a, data, { op, owner: who.owner, res: out, items });
        return out;
      }
      if (!res.here) throw new Error("chest.gone");
      if (foreign && res.guarded) throw new Error("chest.guarded");
      // Снимок свежий, но сундук стал последним, а цифр игрок не видел.
      if (res.fresh && res.last && res.has_net && !confirm) throw new Error("chest.last_confirm");
      // Иначе рюкзак, сеть или охрана поменялись под рукой — план заново.
    }
    throw new Error("chest.busy");
  });
