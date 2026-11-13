// chips-craft-upgrade — auto-upgrade planner + endpoints.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requireWallet, levelKey } from "./chips-mint-helpers";
import { requireFreshClient } from "../buildGate";
import { isChipResting } from "../chipRest";
import { getMiningState, saveMiningState, settleMiningSlots } from "./chips-mint-helpers-mining";
import { CRAFT_RULES } from "./chips-craft";
import { nanoid } from "nanoid";
import { planUpgrade, toPlanPool, type PoolRow } from "./chips-upgrade-plan";
import { craftGoldMult } from "./craft-gold-price";
import { accountGold, payCraftGold, refundCraftGold } from "./craft-gold-pay";

// Планировщик живёт в chips-upgrade-plan (общий с пакетной проверкой);
// реэкспорт — для прежних импортов через chips-craft / chips.
export { lvlEq, acquireChip, countShortfall, type MissReason } from "./chips-upgrade-plan";

async function buildAutoUpgradePlan(baseChipId: string, wallet: string) {
  const { accountOf } = await import("./user");
  const account = await accountOf(wallet);
  const base = await pg.userChipInventory.findOne({ id: baseChipId });
  if (!base) throw new Error("Базовая фишка не найдена");
  if (base.account_id !== account) throw new Error("Это не твоя фишка");
  if (base.status !== "owned") throw new Error("Фишка на продаже — сними её с маркета");
  if (isChipResting(base.rest_until))
    throw new Error("Фишка отдыхает после передачи — крафт доступен через час");
  if (base.level >= 5) throw new Error("Уже максимальный уровень");
  if (!CRAFT_RULES[levelKey(base.level)]) throw new Error("Для этого уровня нет правил прокачки");

  const { data: rawRows } = await pg.userChipInventory
    .raw()
    .select("id,level,template_id,serial_no,rest_until,obtained_at")
    .eq("account_id", account)
    .eq("collection_id", base.collection_id)
    .eq("status", "owned");
  const pool = toPlanPool((rawRows ?? []) as PoolRow[], baseChipId, Date.now());

  // Золото аккаунта и ОДИН множитель цены на весь план.
  const [haveGold, mult] = await Promise.all([accountGold(account), craftGoldMult()]);
  const plan = planUpgrade(
    { id: baseChipId, level: base.level, template: base.template_id },
    pool,
    haveGold,
    mult,
  );
  return { ...plan, account, collectionId: base.collection_id };
}

export const previewAutoUpgradeChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ baseChipId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const plan = await buildAutoUpgradePlan(data.baseChipId, wallet);
    return {
      feasible: plan.feasible,
      feasibleChips: plan.feasibleChips,
      baseLevel: plan.baseLevel,
      targetLevel: plan.targetLevel,
      burnChips: plan.burnChips,
      burnCount: plan.burnChips.length,
      totalGold: plan.totalGold,
      haveGold: plan.haveGold,
      goldShortfall: plan.goldShortfall,
      shortfall: plan.shortfall,
      missReason: plan.missReason,
    };
  });

export const autoUpgradeChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        baseChipId: z.string().min(1),
        // Сколько золота показали игроку: план дороже показанного — отказ.
        expectGold: z.number().min(0).max(1e9),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireFreshClient();
    const wallet = requireWallet();
    const plan = await buildAutoUpgradePlan(data.baseChipId, wallet);
    if (!plan.feasibleChips) throw new Error("Не хватает фишек для авто-улучшения");
    // Цена и баланс — ДО любых движений (снятия с майнинга, списания).
    if (plan.totalGold > data.expectGold + 0.5) throw new Error("Цена изменилась — обнови окно");
    if (plan.goldShortfall > 0)
      throw new Error(`Не хватает золота: нужно ${plan.totalGold}, у тебя ${plan.haveGold}`);

    const burnedIds = new Set<string>([...plan.burnChips.map((c) => c.id), data.baseChipId]);
    const stPre = await getMiningState(wallet);
    const affectedSlots = Object.entries(stPre.slots)
      .filter(([, s]) => burnedIds.has(s.chipId))
      .map(([idx]) => idx);
    if (affectedSlots.length > 0) {
      await settleMiningSlots(stPre, affectedSlots);
      for (const idx of affectedSlots) delete stPre.slots[idx];
      await saveMiningState(wallet, stPre);
    }

    // Сначала ДЕНЬГИ, потом товар (см. chips-craft.ts): id итоговой фишки
    // известен только после RPC, поэтому ключ идемпотентности — по операции.
    const upgradeRef = `upgrade-op:${nanoid(12)}`;
    await payCraftGold(plan.account, plan.totalGold, upgradeRef);

    const { data: rpcRows, error: rpcErr } = await sb.rpc("auto_craft_chip_atomic", {
      p_wallet: wallet,
      p_owner_wallets: [plan.account],
      // cost = 0: билеты больше не берутся, иначе функция запишет «трату
      // билетов» (chip_craft_ticket_spend). Золото уже списано выше.
      p_steps: plan.steps.map((st) => ({ ...st, cost: 0 })),
    });
    if (rpcErr) {
      await refundCraftGold(plan.account, plan.totalGold, upgradeRef);
      const msg = rpcErr.message || String(rpcErr);
      if (msg.includes("sacrifices_must_be_identical"))
        throw new Error("Нужны фишки одного вида — их не хватило");
      if (msg.includes("sacrifices_invalid"))
        throw new Error("Жертвы не подошли (уровень/коллекция) — попробуй ещё раз");
      if (msg.includes("base_not_owned") || msg.includes("base_not_found"))
        throw new Error("Одна из фишек уже использована — обнови и попробуй снова");
      if (msg.includes("base_level_mismatch"))
        throw new Error("Инвентарь изменился — обнови страницу");
      throw new Error(msg);
    }
    const row = (
      rpcRows as Array<{ final_chip_id: string; final_level: number; final_serial: number | null }>
    )[0];
    const { invalidateTicketsCache } = await import("./user");
    invalidateTicketsCache(wallet);
    return {
      ok: true,
      newChipId: row.final_chip_id,
      newLevel: Number(row.final_level),
      burned: plan.burnChips.length,
      spentGold: plan.totalGold,
    };
  });
