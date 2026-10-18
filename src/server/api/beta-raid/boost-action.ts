// Подход к алтарю-БУСТУ: заплатил — герой на N минут крепче на N пунктов.
//
// Бафф временный и работает как дебаф монстра, только в плюс: висит на игроке
// заданные админом минуты и отпускает сам.
//
// Порядок жёсткий: занять ключ операции → взять плату → повесить. Мост
// повторяет запросы вслепую, поэтому ключ операции придумывает КЛИЕНТ и
// присылает с нажатием: повтор того же ключа возвращает уже начисленное и
// никого не обирает второй раз.
//
// Сорвалось начисление — деньги возвращаем и ключ снимаем: платы за бонус,
// которого нет, быть не должно (ПРАВИЛА 8.7).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { selectedHeroRow } from "./hero-current";
import { loadCellBuilding } from "./building-action";
import { boostSource } from "./boost-extra";
import { boostOpAmount, claimBoostOp, releaseBoostOp } from "./hero-boost";
import { applyBoostRoll, loadBuffsFor } from "./hero-buff";
import { loadImmuneTargetsFor } from "./hero-immune";
import { payResources, refundResources } from "./resource-pay";
import { noteEnergyInPrices } from "./econ/trade-hooks";
import { cellBoost, freeOblivion } from "@/lib/boostConfig";
import { rollBoostEffect } from "@/lib/hero/boost";
import { isBuilt } from "@/lib/buildingEffect";

export const takeBuildingBoost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        /** Ключ нажатия: защита от слепого повтора моста. */
        op: z.string().min(6).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (b.effect !== "boost") throw new Error("Это не алтарь");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Алтарь ещё не достроен");

    const cfg = cellBoost(b.config, b.meta);
    if (!cfg) throw new Error("Алтарь ещё не настроен");
    // «Забвение» даром не раздаём: бесплатный алтарь выдавал бы уровни без
    // счёта — то самое даровое забвение, которое владелец отменил 27.09.
    if (freeOblivion(cfg)) throw new Error("oblivion.not_set");

    const hero = await selectedHeroRow(wallet);
    if (!hero) throw new Error("Сначала выбери основного героя");

    const source = boostSource(mapId, data.q, data.r);
    // Каждый эффект бросает свои кубики: у одного алтаря их может быть
    // несколько, и «1-10» у скорости не обязано совпасть с «1-10» у удачи.
    const rolls = cfg.effects.map(rollBoostEffect);
    // Ключ занимаем ДО оплаты: повторный запрос с тем же op не заплатит снова,
    // а прочитает уже записанное.
    const fresh = await claimBoostOp({
      op: data.op,
      heroId: hero.id,
      stat: rolls[0]?.stat ?? "spd",
      amount: rolls.reduce((n, r) => n + r.amount, 0),
      source,
    });
    if (!fresh) {
      return {
        ok: true as const,
        repeat: true as const,
        rolls: [] as typeof rolls,
        total: await boostOpAmount(data.op),
        heroName: hero.name,
      };
    }

    // Кулдаун = сам бафф: пока такой же (по характеристике) ещё висит на игроке,
    // купить нельзя. Иначе продлеваешь таймер бесконечно и каждый раз платишь —
    // абуз без КД (жалоба владельца). Гард ПОСЛЕ claimBoostOp, чтобы слепой
    // повтор моста (тот же op) остался идемпотентным, а спам-клик (свежий op) —
    // ловился; занятый ключ откатываем, платы ещё не было.
    // Иммунитет — тем же правилом: пока висит такой же, второй не продаём.
    // Забвение складывается (уровни, время) — ему этот гард не нужен.
    // Бафф храма замка (07.10.2026) алтарю не мешает: складываются.
    const [active, immune] = await Promise.all([
      loadBuffsFor(wallet, "castle_temple"),
      loadImmuneTargetsFor(wallet),
    ]);
    const busy = (r: (typeof rolls)[number]) =>
      r.stat === "oblivion"
        ? false
        : r.stat === "immune"
          ? immune.has(r.ability ?? "all")
          : (active[r.stat] ?? 0) > 0;
    if (rolls.some(busy)) {
      await releaseBoostOp(data.op);
      throw new Error("Этот бафф ещё действует — купить снова можно, когда он спадёт");
    }

    const ref = `boost:${data.op}`;
    try {
      if (cfg.prices.length > 0) await payResources(wallet, cfg.prices, ref);
      void noteEnergyInPrices(wallet, cfg.prices, "other");
    } catch (e) {
      await releaseBoostOp(data.op);
      throw e;
    }

    try {
      for (const r of rolls) await applyBoostRoll(wallet, r);
    } catch (e) {
      // Бонуса нет — значит и платы быть не должно.
      if (cfg.prices.length > 0) await refundResources(wallet, cfg.prices, ref).catch(() => {});
      await releaseBoostOp(data.op);
      throw e;
    }

    // Статы героя изменились — сбрасываем кэш силы, иначе следующие 15 секунд
    // бой и цена шага считались бы по прежним числам.
    const { invalidateHeroPower } = await import("./hero-power");
    invalidateHeroPower(wallet);

    return {
      ok: true as const,
      repeat: false as const,
      rolls,
      total: rolls.reduce((n, r) => n + r.amount, 0),
      heroName: hero.name,
    };
  });
