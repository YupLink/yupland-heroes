import type { PgRaidNode, PgChipBoss } from "../db/pg";
import { parseFiller, isExtraFiller } from "./reward-filler";
import type { Filler } from "./reward-filler";

// Формат наполнителя переехал в reward-filler.ts (там же разбор и правила
// ссылок). Здесь оставлен реэкспорт: половина проекта импортирует Filler
// отсюда, и переучивать её ради переезда типа — лишний риск на ровном месте.
export type { FillerKind, Filler, RewardResource } from "./reward-filler";
export type PackReward = { packId: string; toPlace: number };
export type ItemReward = { itemTemplateId: string; toPlace: number };
export type RewardConfig = {
  fillers: Filler[];
  split: number[];
  packs: PackReward[];
  items: ItemReward[];
};

export const DEFAULT_SPLIT = [25, 18, 13, 10, 8, 6, 5, 5, 5, 5];

export const sqlStr = (v: string) => `'${String(v).replace(/'/g, "''")}'`;

export function parseRewardConfig(v: unknown): RewardConfig {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const split =
      Array.isArray(o.split) && o.split.length
        ? (o.split as unknown[]).map((x) => Number(x) || 0)
        : [...DEFAULT_SPLIT];
    if (Array.isArray(o.fillers)) {
      return {
        // Мусорные наполнители (ресурс с чужим кодом, товар без cst_) режем
        // здесь: дальше по тракту ссылку взять уже неоткуда.
        fillers: (o.fillers as Record<string, unknown>[])
          .map(parseFiller)
          .filter((fl): fl is NonNullable<typeof fl> => fl !== null),
        split,
        packs: Array.isArray(o.packs)
          ? (o.packs as Record<string, unknown>[]).map((p) => ({
              packId: String(p.packId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
        items: Array.isArray(o.items)
          ? (o.items as Record<string, unknown>[]).map((p) => ({
              itemTemplateId: String(p.itemTemplateId),
              toPlace: Number(p.toPlace) || 0,
            }))
          : [],
      };
    }
  }
  return { fillers: [], split: [...DEFAULT_SPLIT], packs: [], items: [] };
}

export type LocTreeMeta = { level: number; parentId: string | null; node: PgRaidNode };

export function buildLocationTree(nodes: PgRaidNode[]): Map<string, LocTreeMeta> {
  const meta = new Map<string, LocTreeMeta>();
  const chain = nodes
    .filter((n) => n.branch_key === "root")
    .sort((a, b) => a.ordinal - b.ordinal);
  chain.forEach((n, i) =>
    meta.set(n.id, {
      node: n,
      level: i + 1,
      parentId: i === 0 ? null : chain[i - 1].id,
    })
  );
  return meta;
}

export function ancestorIds(id: string, meta: Map<string, LocTreeMeta>): string[] {
  const out: string[] = [];
  let cur = meta.get(id)?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = meta.get(cur)?.parentId ?? null;
  }
  return out;
}

export function travelSteps(
  fromLoc: string | null,
  fromNodeId: string | null,
  toLoc: string,
  toNodeId: string,
  metaByLoc: Map<string, Map<string, LocTreeMeta>>
): number {
  const toMeta = metaByLoc.get(toLoc);
  const toLevel = toMeta?.get(toNodeId)?.level ?? 0;
  if (!fromNodeId || !fromLoc) return toLevel;
  const fromLevel = metaByLoc.get(fromLoc)?.get(fromNodeId)?.level ?? 0;
  if (fromLoc !== toLoc) return fromLevel + toLevel;
  if (!toMeta) return Math.abs(fromLevel - toLevel);
  const fromSet = new Set([fromNodeId, ...ancestorIds(fromNodeId, toMeta)]);
  let lcaLevel = 0;
  for (const a of [toNodeId, ...ancestorIds(toNodeId, toMeta)]) {
    if (fromSet.has(a)) {
      lcaLevel = toMeta.get(a)?.level ?? 0;
      break;
    }
  }
  return fromLevel - lcaLevel + (toLevel - lcaLevel);
}

export function targetReachable(
  toNodeId: string,
  meta: Map<string, LocTreeMeta>,
  deadSet: Set<string>,
  openedChest: Set<string>
): boolean {
  if (!meta.has(toNodeId)) return false;
  const seen = new Set<string>();
  let cur: string | null = toNodeId;
  while (cur) {
    if (seen.has(cur)) return false;
    seen.add(cur);
    const m = meta.get(cur);
    if (!m) return false;
    if (cur !== toNodeId) {
      const t = m.node.node_type;
      if ((t === "boss" || t === "final") && !deadSet.has(cur)) return false;
      if (t.startsWith("chest_") && !openedChest.has(cur)) return false;
    }
    if (m.parentId === null)
      return m.node.branch_key === "root";
    cur = m.parentId;
  }
  return false;
}

export function computeRewardByPlace(
  cfg: RewardConfig,
  packName: Map<string, { name: string; cover: string | null }>
): Array<{
  place: number;
  fillers: Array<{ kind: string; amount: number }>;
  packs: Array<{ name: string; imageUrl: string | null }>;
}> {
  const splitSum = cfg.split.reduce((a, x) => a + (Number(x) || 0), 0);
  const norm = cfg.split.map((x) => (splitSum > 0 ? (Number(x) || 0) / splitSum : 0));
  const out: Array<{
    place: number;
    fillers: Array<{ kind: string; amount: number }>;
    packs: Array<{ name: string; imageUrl: string | null }>;
  }> = [];
  for (let i = 0; i < norm.length; i++) {
    const fillers: Array<{ kind: string; amount: number }> = [];
    for (const fl of cfg.fillers) {
      if (fl.kind === "tickets" || !(fl.amount > 0)) continue;
      // Ресурс и свой товар КЛАССИЧЕСКИЙ рейд не раздаёт (raid-distribute их
      // пропускает), поэтому и в обещании по местам их быть не должно:
      // обещание обязано совпадать с выдачей.
      if (isExtraFiller(fl)) continue;
      const amt = Math.round(fl.amount * norm[i] * 100) / 100;
      const val = fl.kind === "energy" ? Math.round(amt) : amt;
      if (val <= 0) continue;
      fillers.push({
        kind: fl.kind === "token" && fl.token ? fl.token : fl.kind,
        amount: val,
      });
    }
    const packs = cfg.packs
      .filter((p) => p.packId && p.toPlace > 0 && p.toPlace >= i + 1)
      .map((p) => ({
        name: packName.get(p.packId)?.name ?? p.packId,
        imageUrl: packName.get(p.packId)?.cover ?? null,
      }));
    if (fillers.length === 0 && packs.length === 0) continue;
    out.push({ place: i + 1, fillers, packs });
  }
  return out;
}

export function rewardSummary(
  b: PgChipBoss | null,
  mapPackInfo: Map<string, { name: string; cover: string | null }>
) {
  if (!b) return null;
  const cfg = parseRewardConfig(b.reward_tiers);
  const parts = cfg.fillers
    .filter((f) => f.kind !== "tickets" && f.amount > 0 && !isExtraFiller(f))
    .map((f) => ({
      kind: f.kind === "token" && f.token ? f.token : f.kind,
      amount: f.amount,
    }));
  const packs = cfg.packs
    .filter((p) => p.packId && p.toPlace > 0)
    .map((p) => ({
      name: mapPackInfo.get(p.packId)?.name ?? p.packId,
      imageUrl: mapPackInfo.get(p.packId)?.cover ?? null,
      toPlace: p.toPlace,
    }));
  return { parts, packs };
}
