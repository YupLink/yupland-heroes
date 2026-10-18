// chips-craft — craft rules and craftChip endpoint.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requireWallet, levelKey } from "./chips-mint-helpers";
import { requireFreshClient } from "../buildGate";
import { isChipResting } from "../chipRest";
import { getMiningState, saveMiningState, settleMiningSlots } from "./chips-mint-helpers-mining";
import { nanoid } from "nanoid";
import { accountOf } from "./user-shared";

// Re-export DARAI balance/deposit for backward compatibility (imported by routes/chips.tsx)
export {
  computeDaraiBalance,
  getMyDaraiBalance,
  getDaraiDepositInfo,
  myDaraiDeposits,
  verifyDaraiDeposit,
} from "./chips-craft-darai";

// Re-export upgrade planner for barrel
export {
  lvlEq,
  acquireChip,
  countShortfall,
  previewAutoUpgradeChip,
  autoUpgradeChip,
} from "./chips-craft-upgrade";

export const CRAFT_RULES: Record<
  string,
  {
    sacrifices: number;
    requireIdentical: boolean;
    costTickets: number;
    targetLabel: string;
    sacrificeLevel?: number;
  }
> = {
  "1": { sacrifices: 1, requireIdentical: true, costTickets: 0.03, targetLabel: "lvl 1.5" },
  "1.5": { sacrifices: 2, requireIdentical: false, costTickets: 0.07, targetLabel: "lvl 2" },
  "2": { sacrifices: 1, requireIdentical: true, costTickets: 0.28, targetLabel: "lvl 2.5" },
  "2.5": { sacrifices: 2, requireIdentical: false, costTickets: 0.55, targetLabel: "lvl 3" },
  "3": { sacrifices: 2, requireIdentical: true, costTickets: 1.11, targetLabel: "lvl 3.5" },
  "3.5": { sacrifices: 1, requireIdentical: false, costTickets: 2.12, targetLabel: "lvl 4" },
  "4": {
    sacrifices: 1,
    requireIdentical: false,
    costTickets: 3.53,
    targetLabel: "lvl 4.5",
    sacrificeLevel: 3.5,
  },
  "4.5": {
    sacrifices: 2,
    requireIdentical: true,
    costTickets: 5.63,
    targetLabel: "lvl 5",
    sacrificeLevel: 2.5,
  },
};

export const craftChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        baseChipId: z.string().min(1),
        sacrificeChipIds: z.array(z.string().min(1)).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireFreshClient();
    const wallet = requireWallet();
    const { getSisterWallets } = await import("./user");
    const account = await accountOf(wallet);
    const sisters = await getSisterWallets(wallet);
    const base = await pg.userChipInventory.findOne({ id: data.baseChipId });
    if (!base) throw new Error("Базовая фишка не найдена");
    if (base.account_id !== account) throw new Error("Это не твоя фишка");
    if (base.level >= 5) throw new Error("Уже максимальный уровень");
    if (base.status !== "owned")
      throw new Error("Базовая фишка сейчас на продаже — сними её с маркета, чтобы прокачать");
    const rule = CRAFT_RULES[levelKey(base.level)];
    if (!rule) throw new Error("Для этого уровня нет правил прокачки");
    if (data.sacrificeChipIds.length !== rule.sacrifices)
      throw new Error(
        `Нужно ровно ${rule.sacrifices} жертвенных фишек, ты выбрал ${data.sacrificeChipIds.length}`,
      );

    const { data: sacStatusRows } = await pg.userChipInventory
      .raw()
      .select("id,status")
      .in("id", data.sacrificeChipIds);
    const listedSac = ((sacStatusRows ?? []) as Array<{ id: string; status: string }>).filter(
      (s) => s.status !== "owned",
    );
    if (listedSac.length > 0)
      throw new Error(
        "Часть жертвенных фишек на продаже — сними их с маркета, чтобы использовать в крафте",
      );

    const { computeTickets } = await import("./user");
    const tix = await computeTickets(wallet);
    if (tix.availableRaw < rule.costTickets)
      throw new Error(
        `Не хватает билетов: нужно ${rule.costTickets.toFixed(2)}, у тебя ${tix.availableRaw.toFixed(2)}`,
      );

    {
      const craftIds = [data.baseChipId, ...data.sacrificeChipIds];
      const { data: restRows } = await pg.userChipInventory
        .raw()
        .select("id,rest_until")
        .in("id", craftIds);
      if (
        ((restRows ?? []) as Array<{ rest_until: string | null }>).some((r) =>
          isChipResting(r.rest_until),
        )
      )
        throw new Error("Одна из фишек отдыхает после передачи — крафт доступен через час");
    }

    const burnedIds = new Set<string>([data.baseChipId, ...data.sacrificeChipIds]);
    const stPreCraft = await getMiningState(wallet);
    const affectedSlots = Object.entries(stPreCraft.slots)
      .filter(([, s]) => burnedIds.has(s.chipId))
      .map(([idx]) => idx);
    if (affectedSlots.length > 0) {
      await settleMiningSlots(stPreCraft, affectedSlots);
      for (const idx of affectedSlots) delete stPreCraft.slots[idx];
      await saveMiningState(wallet, stPreCraft);
    }

    // Сначала ДЕНЬГИ, потом товар: раньше фишку улучшали, а списывали после —
    // при отказе списания крафт выходил бесплатным, а два запроса внутри
    // 5-секундного кэша баланса проходили проверку оба. Ключ идемпотентности
    // по операции: id новой фишки станет известен только после RPC.
    const craftRef = `craft-op:${nanoid(12)}`;
    if (rule.costTickets > 0) {
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({ wallet, delta: -rule.costTickets, kind: "craft", ref: craftRef });
    }
    const undoCraftDebit = async () => {
      if (rule.costTickets <= 0) return;
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({
        wallet,
        delta: rule.costTickets,
        kind: "refund",
        ref: `craft-undo:${craftRef}`,
      }).catch((e: unknown) => console.error(`[craft] возврат не прошёл ${wallet}:`, e));
    };

    const { data: rpcRows, error: rpcErr } = await sb.rpc("craft_chip_atomic", {
      p_wallet: wallet,
      p_base_id: data.baseChipId,
      p_sacrifice_ids: data.sacrificeChipIds,
      p_require_identical: rule.requireIdentical,
      p_cost_tickets: rule.costTickets,
      p_owner_wallets: sisters,
      p_sacrifice_level: rule.sacrificeLevel ?? base.level,
    });
    if (rpcErr) {
      // Фишка не улучшена — билеты возвращаем.
      await undoCraftDebit();
      const msg = rpcErr.message || String(rpcErr);
      if (msg.includes("sacrifices_must_be_identical"))
        throw new Error("Все жертвенные фишки должны быть того же типа");
      if (msg.includes("sacrifices_invalid"))
        throw new Error("Жертвенные фишки должны быть того же уровня из той же коллекции");
      if (msg.includes("base_not_owned"))
        throw new Error("Базовая фишка не твоя или уже использована");
      if (msg.includes("base_not_found")) throw new Error("Базовая фишка не найдена");
      if (msg.includes("max_level_reached")) throw new Error("Уже максимальный уровень");
      throw new Error(msg);
    }

    const row = (
      rpcRows as Array<{
        new_chip_id: string;
        new_level: number;
        new_template_id: string;
        new_collection_id: string;
      }>
    )[0];

    const { invalidateTicketsCache } = await import("./user");
    invalidateTicketsCache(wallet);
    return {
      ok: true,
      newChipId: row.new_chip_id,
      newLevel: row.new_level,
      newTemplateId: row.new_template_id,
      newCollectionId: row.new_collection_id,
      costTickets: rule.costTickets,
    };
  });
