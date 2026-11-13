import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Map as MapIcon, ArrowRight, Loader2 } from "lucide-react";
import { thumb } from "@/lib/image";
import { rewardShownAmount } from "@/lib/rewardKinds";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { chooseRaidLocation } from "@/server/api/raid-nav";
import { DifficultyBadge } from "./DifficultyBadge";
import { humanError } from "@/lib/humanError";

export function LocationCard({
  loc,
  onPick,
}: {
  loc: { id: string; name: string; imageUrl: string | null; difficulty?: string | null };
  onPick: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const choose = useMutation({
    mutationFn: () => chooseRaidLocation({ data: { locationId: loc.id } }),
    onSuccess: onPick,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <button
      onClick={() => choose.mutate()}
      disabled={choose.isPending}
      className="overflow-hidden rounded-2xl border border-border bg-card text-left transition active:scale-95 disabled:opacity-60"
    >
      <div className="aspect-video w-full bg-secondary">
        {loc.imageUrl ? (
          <img src={thumb(loc.imageUrl, 320)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <MapIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-3">
        <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">{localizeAssetName(loc.name, lang)}</span>
        <DifficultyBadge difficulty={loc.difficulty} />
        {choose.isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
        ) : (
          <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
        )}
      </div>
    </button>
  );
}

export function rewardStr(
  reward: {
    parts: Array<{ kind: string; amount: number }>;
    packs: number;
  },
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const std = new Set(["likes", "tickets", "energy"]);
  const p = reward.parts
    .filter((x) => x.amount > 0)
    .map(
      (x) =>
        `${fillerIcon(x.kind)} ${rewardShownAmount(x.kind, x.amount).toLocaleString()}${std.has(x.kind) ? "" : " " + x.kind}`
    );
  if (reward.packs > 0) p.push(`🎴 ×${reward.packs}`);
  return p.length ? p.join(" · ") : t("raid.no_reward");
}

function fillerIcon(kind: string): string {
  switch (kind) {
    case "likes": return "❤️";
    case "tickets": return "🪙"; // золото ×100 (ПРАВИЛА §8.61)
    case "energy": return "⚡";
    default: return "🪙";
  }
}
