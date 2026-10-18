// Что показать в окне грядки: что растёт, кто работает и что накопилось.
//
// Отдельным модулем от building-extra: тот и так у потолка в 250 строк, а у
// поля свой учёт долей (raid_field_*), общего с шахтой у них только конфиг.
import { accAccountId } from "../currency/move";
import { parseFieldConfig } from "@/lib/fieldConfig";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { fieldWorkers } from "./field";

export async function fieldExtra(opts: {
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const { built, wallet, mapId, q, r } = opts;
  const cfg = parseFieldConfig(opts.cellConfig) ?? parseFieldConfig(opts.meta);
  if (!cfg) {
    return {
      kind: "field",
      reward: { kind: "resource", resource: "wood", token: null },
      yieldAmount: 0,
      workers: 0,
      myHero: null,
      share: 0,
      can: false,
      reasonKey: "braid.field_unset",
    };
  }
  const account = await accAccountId(wallet).catch(() => null);
  const workers = await fieldWorkers(mapId, q, r);
  const mineRow = workers.find((w) => w.account_id === account) ?? null;
  return {
    kind: "field",
    reward: cfg.reward,
    yieldAmount: cfg.yield,
    workers: workers.length,
    myHero: mineRow ? { id: mineRow.hero_id ?? "", name: mineRow.hero_name ?? "Герой" } : null,
    // Доля считается по тем, кто УЖЕ на поле: встанешь сам — станет меньше.
    share: workers.length > 0 ? cfg.yield / workers.length : cfg.yield,
    can: built,
    reasonKey: built ? null : "braid.field_unfinished",
  };
}
