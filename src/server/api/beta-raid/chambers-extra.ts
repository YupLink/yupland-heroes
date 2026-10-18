// Что окно покоев показывает игроку: цены (что настроил админ) и что сейчас
// на нём висит из дебаффов. По образцу treeExtra и boostExtra.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { cellChambersPrices, type BuildingExtra } from "@/lib/buildingEffect";
import { WEAKEN_KINDS } from "./abilities";

type Args = {
  built: boolean;
  wallet: string;
  meta?: unknown;
  cellConfig?: unknown;
};

const PLAYER_KINDS = ["slow", ...WEAKEN_KINDS];
const KIND_LIST = PLAYER_KINDS.map(sqlStr).join(",");

/** Что за kind в списке эффектов — для группировки в UI. */
function groupOf(kind: string): "slow" | "weaken" | "stun" | "poison" {
  if (kind === "slow") return "slow";
  if (kind === "stun") return "stun";
  if (kind === "poison") return "poison";
  return "weaken";
}

export async function chambersExtra(opts: Args): Promise<BuildingExtra> {
  const prices = cellChambersPrices(opts.cellConfig, opts.meta);

  // Что уже висит на игроке. Показываем всё, чтобы он понимал, что уйдёт.
  const account = await raidOwner(opts.wallet).catch(() => "");
  const active: Array<{
    kind: string;
    value: number;
    expiresAt: string;
    group: "slow" | "weaken" | "stun" | "poison";
    source: string | null;
  }> = [];

  if (account) {
    const playerRows = (await mcpExec(
      `SELECT kind, value, expires_at
         FROM yuplink.beta_raid_player_effects
        WHERE account_id = ${sqlStr(account)}
          AND kind IN (${KIND_LIST}) AND expires_at > now()
        ORDER BY expires_at DESC;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ kind: string; value: number; expires_at: string }>;
    for (const r of playerRows ?? []) {
      active.push({
        kind: r.kind,
        value: Number(r.value) || 0,
        expiresAt: String(r.expires_at),
        group: groupOf(r.kind),
        source: null,
      });
    }

    // Стан/яд на фишках аккаунта.
    const chipRows = (await mcpExec(
      `SELECT e.kind, e.value, e.expires_at, coalesce(t.name, c.template_id) AS source
         FROM yuplink.chip_effects e
         JOIN yuplink.user_chip_inventory c ON c.id = e.chip_id
         LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
        WHERE c.account_id = ${sqlStr(account)} AND e.expires_at > now()
        ORDER BY e.expires_at DESC;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{
      kind: string;
      value: number;
      expires_at: string;
      source: string | null;
    }>;
    for (const r of chipRows ?? []) {
      active.push({
        kind: r.kind,
        value: Number(r.value) || 0,
        expiresAt: String(r.expires_at),
        group: groupOf(r.kind),
        source: r.source ?? null,
      });
    }
  }

  const nothingToClear = active.length === 0;
  return {
    kind: "chambers",
    prices,
    active,
    can: opts.built && prices.length > 0 && !nothingToClear,
    reasonKey: !opts.built
      ? "braid.chambers_unfinished"
      : prices.length === 0
        ? "braid.chambers_no_prices"
        : nothingToClear
          ? "braid.chambers_nothing"
          : null,
  };
}
