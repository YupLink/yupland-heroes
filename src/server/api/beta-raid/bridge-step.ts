import { shipTransit, type HexCell } from "@/lib/raid/bridgeTransit";
import { loadStepFacts, type StepFacts } from "./step-facts";

export type BridgePassage = { crossed: StepFacts[]; oceanCount: number };

/** A ship may request the water cell beyond a bridge, never a bridge cell itself. */
export async function bridgePassage(
  mapId: string,
  from: HexCell,
  to: HexCell,
  exit: StepFacts,
  bigShip: boolean,
): Promise<BridgePassage | null> {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const distance = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  if (distance < 2 || distance > 13) return null;
  if (!(dq === 0 || dr === 0 || dq + dr === 0)) return null;
  const direction = { q: Math.sign(dq), r: Math.sign(dr) };
  const coords = Array.from({ length: distance - 1 }, (_, i) => ({
    q: from.q + direction.q * (i + 1),
    r: from.r + direction.r * (i + 1),
  }));
  const facts = await Promise.all(coords.map((c) => loadStepFacts(mapId, c.q, c.r)));
  const byCell = new Map(coords.map((c, i) => [`${c.q},${c.r}`, facts[i]]));
  byCell.set(`${to.q},${to.r}`, exit);
  const transit = shipTransit(from, direction, (c) => {
    const at = byCell.get(`${c.q},${c.r}`);
    if (!at) return null;
    const aliveObject = !!at.objectId && at.objectKnown && (!at.hpFound || Number(at.hpValue) > 0);
    return {
      water: at.water,
      ocean: at.ocean,
      bridge: at.bridge ?? null,
      blocked: !at.terrainId || at.voidFog || at.mine || aliveObject || !!at.blasted ||
        (at.berth?.ships ?? 0) > 0 || (!!at.decorationBlocks && !at.bridge) || (at.ocean && !bigShip),
    };
  });
  if (!transit || transit.exit.q !== to.q || transit.exit.r !== to.r) return null;
  return { crossed: facts.filter((f): f is StepFacts => !!f), oceanCount: transit.oceanCount };
}
