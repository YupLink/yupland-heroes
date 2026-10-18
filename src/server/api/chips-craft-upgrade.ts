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

  const { computeTickets } = await import("./user");
  const tix = await computeTickets(wallet);
  const plan = planUpgrade(
    { id: baseChipId, level: base.level, template: base.template_id },
    pool,
    tix.availableRaw,
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
      totalTickets: plan.totalTickets,
      haveTickets: plan.haveTickets,
      ticketShortfall: plan.ticketShortfall,
      shortfall: plan.shortfall,
      missReason: plan.missReason,
    };
  });

export const autoUpgradeChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ baseChipId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireFreshClient();
    const wallet = requireWallet();
    const plan = await buildAutoUpgradePlan(data.baseChipId, wallet);
    if (!plan.feasibleChips) throw new Error("Не хватает фишек для авто-улучшения");
    if (plan.ticketShortfall > 0)
      throw new Error(`Не хватает билетов: нужно ${plan.totalTickets}, у тебя ${plan.haveTickets}`);

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
    if (plan.totalTickets > 0) {
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({ wallet, delta: -plan.totalTickets, kind: "craft", ref: upgradeRef });
    }
    const undoUpgradeDebit = async () => {
      if (plan.totalTickets <= 0) return;
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({
        wallet,
        delta: plan.totalTickets,
        kind: "refund",
        ref: `upgrade-undo:${upgradeRef}`,
      }).catch((e: unknown) => console.error(`[upgrade] возврат не прошёл ${wallet}:`, e));
    };

    const { data: rpcRows, error: rpcErr } = await sb.rpc("auto_craft_chip_atomic", {
      p_wallet: wallet,
      p_owner_wallets: [plan.account],
      p_steps: plan.steps,
    });
    if (rpcErr) {
      await undoUpgradeDebit();
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
      spentTickets: plan.totalTickets,
    };
  });
