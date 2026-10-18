// chips-stake-energy — energy management (spend, buy with likes, admin grant).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { noteEnergySpendByWallet } from "./beta-raid/econ/energy-note";

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");
  return w;
}

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}

export const getMyEnergy = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = requireWallet();
    const { data, error } = await sb.rpc("compute_energy", {
      p_wallet: wallet,
    });
    if (error) throw new Error(error.message);
    const row = (data as Array<{
      energy_now: number;
      max_energy: number;
      next_regen_seconds: number;
    }>)[0];
    return {
      energy: row.energy_now,
      maxEnergy: row.max_energy,
      nextRegenSec: row.next_regen_seconds,
    };
  }
);

export const spendEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ amount: z.number().int().min(1).max(30) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const { data: rpcRows, error } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: data.amount,
    });
    if (error) {
      if (error.message.includes("not_enough_energy")) {
        throw new Error("Не хватает энергии");
      }
      throw new Error(error.message);
    }
    void noteEnergySpendByWallet(wallet, data.amount, "stake");
    const row = (rpcRows as Array<{
      energy_now: number;
      max_energy: number;
      next_regen_seconds: number;
    }>)[0];
    return {
      energy: row.energy_now,
      maxEnergy: row.max_energy,
      nextRegenSec: row.next_regen_seconds,
    };
  });

// «Энергия за лайки» переехала в свой модуль (настраивается из админки);
// реэкспорт держит прежние импорты живыми.
export { getEnergyLikeOffer, buyEnergyForLikes } from "./energy-like-offer";

export const adminGrantEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ amount: z.number().int().min(1).max(100000) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const { error } = await sb.rpc("add_energy", {
      p_wallet: wallet,
      p_amount: data.amount,
      p_kind: "energy_admin",
    });
    if (error) throw new Error(error.message);
    const { data: eData, error: eErr } = await sb.rpc("compute_energy", {
      p_wallet: wallet,
    });
    if (eErr) throw new Error(eErr.message);
    const eRow = (eData as Array<{ energy_now: number }>)[0];
    return { ok: true, added: data.amount, energyNow: eRow.energy_now };
  });
