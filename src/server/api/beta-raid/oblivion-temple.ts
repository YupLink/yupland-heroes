// Постройка «ЗАБВЕНИЕ»: заплатил — получил эффект «Забвение» (заряды, заряды со
// сроком или без счёта на время).
//
// Правило владельца 27.09.2026: цена — строки «ресурс + сколько», уровень (по
// умолчанию 1) и необязательное время действия — в настройке клетки
// (lib/oblivionConfig.ts). Что даёт пара «уровень + минуты» — правило 28.09
// (lib/hero/oblivionRule.ts): неверная пара не продаётся. Модель эффекта —
// lib/hero/boostOblivion.ts.
//
// Порядок, как у алтаря (ПРАВИЛА 8.7): проверки → ключ нажатия →
// деньги → эффект → не выдался — деньги назад. Ключ нажатия после попытки
// оплаты не отпускаем даже при возврате: повтор того же нажатия прошёл бы по
// уже возвращённой оплате даром (списания коротко замыкаются по ключу).
// Выдача несёт свой ключ в raid_backpack_op тем же оператором: ответ моста
// потерялся — ключ есть, значит выдано, и денег не возвращаем.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { claimBoostOp } from "@/server/api/beta-raid/hero-boost";
import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";
import { noteEnergyInPrices } from "@/server/api/beta-raid/econ/trade-hooks";
import { grantOblivion, opMarked } from "@/server/api/beta-raid/oblivion";
import { checkCellOblivion } from "@/lib/oblivionConfig";
import { rollBoostEffect } from "@/lib/hero/boost";
import { isBuilt } from "@/lib/buildingEffect";

export type OblivionTakeResult = {
  ok: true;
  /** Повтор того же нажатия: второй раз ничего не списано и не выдано. */
  repeat: boolean;
  /** Что выпало: заряды (0 — без счёта) и минуты (0 — без срока). */
  level: number;
  minutes: number;
};

export const takeOblivion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        /** Ключ нажатия (newOpId): повтор того же запроса не спишет второй раз. */
        op: z.string().regex(/^[a-z0-9]{6,80}$/i),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<OblivionTakeResult> => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b || b.effect !== "oblivion") throw new Error("oblivion.not_here");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("oblivion.unbuilt");
    // Цена не задана — получить нельзя: пустая цена не значит «даром». Неверная
    // пара «уровень + минуты» (уже лежала в базе) — тоже нельзя, выдавать нечего.
    const chk = checkCellOblivion(b.config, b.meta);
    if (!chk.ok) throw new Error(chk.reasonKey);
    const cfg = chk.cfg;

    const account = await raidOwner(wallet);
    const roll = rollBoostEffect({ stat: "oblivion", value: cfg.level, minutes: cfg.minutes });
    // Ключ занимаем ДО оплаты: повтор с тем же op не заплатит и не получит снова.
    const fresh = await claimBoostOp({
      op: data.op,
      heroId: account,
      stat: "oblivion",
      amount: roll.amount,
      source: `oblivion:${mapId}:${data.q},${data.r}`,
    });
    if (!fresh) return { ok: true, repeat: true, level: 0, minutes: 0 };

    // Ключ оплаты — клетка, аккаунт и нажатие: так же, как у грядки.
    const ref = `oblivion:${mapId}:${data.q}:${data.r}:${account}:${data.op}`;
    // Отказ оплаты летит как есть, как у алтаря: сбой связи клиент покажет
    // «сервис обновляется», а не «оплата не прошла: MCP timeout».
    await payResources(wallet, cfg.prices, ref);
    void noteEnergyInPrices(wallet, cfg.prices, "spell");

    const grantRef = `oblgrant:${account}:${data.op}`;
    try {
      await grantOblivion(account, roll, grantRef);
    } catch (e) {
      console.error("[oblivion] эффект не выдан:", account, e);
      // Ключ выдачи лёг — эффект у игрока, потерялся только ответ.
      if (!(await opMarked(grantRef).catch(() => false))) {
        await refundResources(wallet, cfg.prices, ref);
        throw new Error("oblivion.failed");
      }
    }
    return { ok: true, repeat: false, level: roll.amount, minutes: roll.minutes };
  });
