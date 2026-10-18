// Плата за удар: списать энергию и уметь вернуть её, если бой не состоялся.
//
// Жалоба игроков звучала так: «энергию сняло, а урон по боссу не прошёл».
// Между списанием и записью урона стояли три обращения к базе, и обрыв связи
// на любом из них оставлял игрока без энергии и без удара. Теперь плата —
// последнее действие перед боем, а на случай сбоя есть возврат.
import { sb } from "../../db/pg";
import { noteEnergySpendByWallet } from "./econ/energy-note";
import type { EnergySpendReason } from "@/lib/econ/types";
import { SATIETY_COST } from "@/lib/hero/satiety";

export type HitPayment = {
  /** Вернуть плату: бой не состоялся, значит и брать не за что. */
  refund: () => Promise<void>;
};

export async function payForHit(
  wallet: string,
  cost: number,
  /** На что ушло — в суточный агрегат причин (по умолчанию бой). */
  reason: EnergySpendReason = "fight",
): Promise<HitPayment> {
  const { error } = await sb.rpc("touch_energy_atomic", { p_wallet: wallet, p_spend: cost });
  if (error) {
    if (String(error.message).includes("not_enough_energy"))
      throw new Error(`Нужно ${cost} энергии`);
    throw new Error(error.message);
  }
  void noteEnergySpendByWallet(wallet, cost, reason);
  // Бой стоит герою сытости (−10, lib/hero/satiety); не состоялся — вернём.
  const fight = reason === "fight";
  if (fight) await spendSatiety(wallet, -SATIETY_COST.fight);
  return {
    refund: async () => {
      if (fight) await spendSatiety(wallet, SATIETY_COST.fight);
      // Возврат сам по себе тоже может не пройти — тогда хотя бы останется
      // след в логе: молча терять чужую энергию нельзя.
      try {
        const { error } = await sb.rpc("add_energy", {
          p_wallet: wallet,
          p_amount: cost,
          p_kind: "energy_refund",
        });
        if (error) console.error("[beta-attack] возврат энергии не прошёл:", error.message);
      } catch (e) {
        console.error("[beta-attack] возврат энергии не прошёл:", e);
      }
    },
  };
}

/** Сытость героя за бой — без героя или при сбое бой идёт как раньше. */
async function spendSatiety(wallet: string, delta: number): Promise<void> {
  const { moveSatiety } = await import("./hero-satiety");
  await moveSatiety(wallet, delta).catch(() => null);
}
