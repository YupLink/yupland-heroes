// Что показывает окно алтаря-БУСТА: прибавка, цена и кому она достанется.
//
// Ненастроенный алтарь молчит вовсе (extra = null): пустая плашка «+0 к
// скорости» игроку ничего не объясняет, а на карте таких обликов много.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { cellBoost, freeOblivion } from "@/lib/boostConfig";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { selectedHeroRow } from "./hero-current";
import { buffKind } from "./hero-buff";
import { raidOwner } from "./owner";
import type { BoostNumStat } from "@/lib/hero/boost";

/** Ключ источника: у каждой клетки свой счёт выданного. */
export function boostSource(mapId: string, q: number, r: number): string {
  return `cell:${mapId}:${q},${r}`;
}

/** Какие бусты по этим характеристикам висят на игроке прямо сейчас. */
export async function activeBuffs(
  account: string,
  stats: BoostNumStat[],
): Promise<Array<{ stat: BoostNumStat; value: number; expiresAt: string }>> {
  const uniq = [...new Set(stats)];
  if (uniq.length === 0) return [];
  const rows = (await mcpExec(
    `SELECT kind, value, expires_at AS "expiresAt" FROM yuplink.beta_raid_player_effects
      WHERE account_id = ${sqlStr(account)}
        AND kind IN (${uniq.map((s) => sqlStr(buffKind(s))).join(",")})
        AND expires_at > now();`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string; value: number; expiresAt: string }>;
  const out: Array<{ stat: BoostNumStat; value: number; expiresAt: string }> = [];
  for (const r of rows ?? []) {
    const stat = uniq.find((s) => buffKind(s) === r.kind);
    const value = Math.max(0, Math.floor(Number(r.value) || 0));
    if (stat && value > 0) out.push({ stat, value, expiresAt: String(r.expiresAt) });
  }
  return out;
}

export async function boostExtra(opts: {
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const cfg = cellBoost(opts.cellConfig, opts.meta);
  if (!cfg) return null;

  const hero = await selectedHeroRow(opts.wallet);
  // Что уже висит по этой характеристике: буст временный, и игроку важнее
  // «сколько осталось», чем «сколько всего когда-то дали».
  const account = await raidOwner(opts.wallet).catch(() => "");
  const active = account
    ? await activeBuffs(
        account,
        // Иммунитет и забвение — не прибавка: их остаток показывает значок над героем.
        cfg.effects.flatMap((e) => (e.stat === "immune" || e.stat === "oblivion" ? [] : [e.stat])),
      )
    : [];

  return {
    kind: "boost",
    effects: cfg.effects,
    prices: cfg.prices,
    active,
    heroName: hero?.name ?? null,
    // Бесплатно «Забвение» не выдаётся — кнопка гаснет с той же причиной.
    can: opts.built && !!hero && !freeOblivion(cfg),
    reasonKey: !opts.built
      ? "braid.boost_unfinished"
      : !hero
        ? "braid.boost_no_hero"
        : freeOblivion(cfg)
          ? "oblivion.not_set"
          : null,
  };
}
