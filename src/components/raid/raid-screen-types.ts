import type { getRaidState } from "@/server/api/raid-state";

export type StateT = Awaited<ReturnType<typeof getRaidState>>;
export type NodeT = StateT["nodes"][number];

export type RewardCfg = {
  fillers: {
    kind: string;
    amount: number;
    token?: string | null;
    /** kind='resource' — код ресурса счёта; kind='custom' — шаблон товара. */
    resource?: string | null;
    itemId?: string | null;
    /** kind='custom' — штучно первым N местам, как пак. */
    toPlace?: number | null;
    /** Имя и картинка своего товара — приходят в decorateRewardConfig. */
    name?: string;
    imageUrl?: string | null;
  }[];
  split: number[];
  packs: { packId: string; toPlace: number; name?: string; imageUrl?: string | null }[];
  /** Штучные предметы «до места N» — приходят в decorateRewardConfig. */
  items?: {
    itemTemplateId: string;
    toPlace: number;
    name?: string;
    imageUrl?: string | null;
  }[];
};

export function fillerIcon(kind: string): string {
  switch (kind) {
    case "likes":
      return "❤️";
    case "tickets": // выдаётся золотом ×100 (ПРАВИЛА §8.61)
      return "🪙";
    case "energy":
      return "⚡";
    default:
      return "🪙";
  }
}

export const DIFF_META: Record<string, { key: string; cls: string }> = {
  newbie: { key: "raid.diff_newbie", cls: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" },
  medium: { key: "raid.diff_medium", cls: "border-amber-400/40 bg-amber-400/15 text-amber-300" },
  hard: { key: "raid.diff_hard", cls: "border-rose-400/40 bg-rose-400/15 text-rose-300" },
};
