// Пакетная проверка «можно ли улучшить» — для фильтра Тренировочного лагеря.
//
// Один ответ на все фишки игрока: по каждой «можно» (сколько золота и фишек
// уйдёт) или «нельзя» с причиной. Правила те же, что у кнопки «Улучшить»:
// тот же планировщик с автоподбором (chips-upgrade-plan), те же проверки в
// том же порядке, что buildAutoUpgradePlan, баланс золота и цена по текущему
// курсу. Повторять их на клиенте нельзя, а запрос на каждую фишку уронил бы список.
//
// Считаем один раз на вид «коллекция + шаблон + уровень»: фишки одного вида
// для планировщика неотличимы, и у игрока с 5000 фишек видов — около сотни.
// Тренировочных фишек (hallway_training_chips) в ответе нет — их не улучшают.
import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { requireWallet, levelKey } from "./chips-mint-helpers";
import { CRAFT_RULES } from "./chips-craft";
import { planUpgrade, toPlanPool, type PlanChip, type PoolRow } from "./chips-upgrade-plan";
import { craftGoldMult } from "./craft-gold-price";
import { accountGold } from "./craft-gold-pay";
import type { ChipUpgradeState, UpgradeBlock, UpgradeReadiness } from "@/lib/chips/upgradeBlock";

export type { ChipUpgradeState, UpgradeBlock, UpgradeReadiness };

export type ReadinessRow = PoolRow & { collection_id: string; status: string };

const no = (reason: UpgradeBlock): ChipUpgradeState => ({ can: false, reason });

export function upgradeReadiness(
  rows: ReadinessRow[],
  haveGold: number,
  mult: number,
  now: number,
): UpgradeReadiness {
  // Пул коллекции — только «свои на руках» без отдыхающих, в общем порядке.
  const pools = new Map<string, PlanChip[]>();
  const byCollection = new Map<string, ReadinessRow[]>();
  for (const r of rows) {
    if (r.status !== "owned") continue;
    const list = byCollection.get(r.collection_id) ?? [];
    list.push(r);
    byCollection.set(r.collection_id, list);
  }
  for (const [id, list] of byCollection) pools.set(id, toPlanPool(list, null, now));

  const memo = new Map<string, ChipUpgradeState>();
  const stateOf = (r: ReadinessRow): ChipUpgradeState => {
    if (r.status !== "owned")
      return no({
        kind: r.status === "listed" ? "listed" : r.status === "staked" ? "studying" : "unavailable",
      });
    if (r.rest_until && new Date(r.rest_until).getTime() > now)
      return no({ kind: "resting", until: r.rest_until });
    const level = Number(r.level);
    if (level >= 5) return no({ kind: "max" });
    if (!CRAFT_RULES[levelKey(level)]) return no({ kind: "no_rules" });
    const key = `${r.collection_id}|${r.template_id}|${levelKey(level)}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const pool = (pools.get(r.collection_id) ?? []).filter((c) => c.id !== r.id);
    const plan = planUpgrade({ id: r.id, level, template: r.template_id }, pool, haveGold, mult);
    const state: ChipUpgradeState = !plan.feasibleChips
      ? no(
          plan.missReason?.kind === "same_type"
            ? { kind: "same_type", level: plan.missReason.level }
            : { kind: "chips", shortfall: plan.shortfall },
        )
      : plan.goldShortfall > 0
        ? no({ kind: "gold", need: plan.totalGold, have: plan.haveGold })
        : { can: true, gold: plan.totalGold, burn: plan.burnChips.length };
    memo.set(key, state);
    return state;
  };

  const chips: Record<string, ChipUpgradeState> = {};
  for (const r of rows) chips[r.id] = stateOf(r);
  return { haveGold: Math.floor(haveGold), chips };
}

export const getChipUpgradeReadiness = createServerFn({ method: "GET" }).handler(
  async (): Promise<UpgradeReadiness> => {
    const wallet = requireWallet();
    const { accountOf } = await import("./user");
    const account = await accountOf(wallet);
    const [inv, haveGold, mult] = await Promise.all([
      pg.userChipInventory
        .raw()
        .select("id,level,template_id,collection_id,serial_no,status,rest_until,obtained_at")
        .eq("account_id", account)
        .in("status", ["owned", "listed", "staked"]),
      accountGold(account),
      craftGoldMult(),
    ]);
    const rows = ((inv as { data: ReadinessRow[] | null }).data ?? []) as ReadinessRow[];
    return upgradeReadiness(rows, haveGold, mult, Date.now());
  },
);
