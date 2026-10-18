// Охрана шахт для карты и сундуков: один запрос на ключ beta-raid-mine-guards.
// Шлём свою версию — если охрана не менялась, сервер отвечает одной версией,
// и в кэше остаётся прежний объект (без перерисовки). См. lib/mineGuardsWire.
import type { QueryClient } from "@tanstack/react-query";
import { getMineGuards } from "@/server/api/beta-raid/mine-guard";
import { unpackGuards, type GuardView } from "@/lib/mineGuardsWire";

export const MINE_GUARDS_KEY = ["beta-raid-mine-guards"] as const;

export type MineGuards = { guards: Record<string, GuardView>; v?: string };

export async function fetchMineGuards(qc: QueryClient): Promise<MineGuards> {
  const prev = qc.getQueryData<MineGuards>(MINE_GUARDS_KEY);
  const res = await getMineGuards({ data: { since: prev?.v ?? "" } });
  if ("same" in res) return prev ?? { guards: {}, v: res.v };
  if ("cells" in res) return { guards: unpackGuards(res), v: res.v };
  return { guards: res.guards };
}
