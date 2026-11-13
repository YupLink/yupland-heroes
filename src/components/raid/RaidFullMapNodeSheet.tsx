import { Loader2, Check, Heart, Users, Zap, Skull, X, GitFork } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { fillerIcon } from "./raid-screen-types";
import { rewardShownAmount } from "@/lib/rewardKinds";
import type { getRaidFullMap } from "@/server/api/raid-map";

type FullMapT = Awaited<ReturnType<typeof getRaidFullMap>>;
type FullLocT = FullMapT["locations"][number];
type FullNodeT = FullLocT["nodes"][number];

export function FullMapNodeSheet({
  node,
  loc,
  energy,
  pending,
  onGo,
  onClose,
}: {
  node: FullNodeT;
  loc: FullLocT;
  energy: number;
  pending: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const hpPct =
    node.maxHp && node.maxHp > 0
      ? Math.max(0, Math.min(100, ((node.currentHp ?? 0) / node.maxHp) * 100))
      : null;
  const canGo = node.reachable && !node.isCurrent && energy >= node.steps;
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 max-h-[85%] space-y-3 overflow-y-auto rounded-t-3xl border-t border-gold/30 bg-card p-4 pb-6 shadow-boss [background-color:hsl(var(--card))]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {localizeAssetName(loc.name, lang)}
          {node.type === "fork" ? t("raid.fork_suffix") : node.type === "final" ? t("raid.final_suffix") : ""}
        </span>
        {node.dead && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neon">
            <Check className="h-3.5 w-3.5" /> {t("raid.defeated")}
          </span>
        )}
        <button onClick={onClose} className="ml-auto text-muted-foreground transition active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>

      {hpPct != null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3 text-red-400" /> HP
            </span>
            <span className="font-mono">
              {(node.currentHp ?? 0).toLocaleString()} / {node.maxHp!.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", node.dead ? "bg-secondary" : "gradient-boss-hp")}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
      )}

      {(() => {
        const parts = Array.isArray(node.reward?.parts) ? node.reward!.parts : [];
        const packs = Array.isArray(node.reward?.packs) ? node.reward!.packs : [];
        if (parts.length === 0 && packs.length === 0) return null;
        return (
        <div className="space-y-1.5">
          {parts.filter((x) => x.amount > 0).length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {parts
                  .filter((x) => x.amount > 0)
                  .map(
                    (x) =>
                      `${fillerIcon(x.kind)} ${rewardShownAmount(x.kind, x.amount).toLocaleString()}${
                        ["likes", "tickets", "energy"].includes(x.kind) ? "" : " " + x.kind
                      }`
                  )
                  .join(" · ")}
              </span>
            </div>
          )}
          {packs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {p.imageUrl ? (
                <img src={thumb(p.imageUrl, 56)} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-xs">
                  🎴
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {p.name} <span className="text-gold">{t("raid.top_n", { n: p.toPlace })}</span>
              </span>
            </div>
          ))}
        </div>
        );
      })()}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4 shrink-0 text-gold" /> {t("raid.on_location", { n: loc.headcount })}
      </div>

      {node.type === "fork" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3.5 text-sm font-medium text-gold">
          <GitFork className="h-4 w-4" /> {t("raid.fork_branch_here")}
        </div>
      ) : (
      <button
        onClick={onGo}
        disabled={!canGo || pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3.5 font-bold text-gold-foreground shadow-gold transition enabled:active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t("raid.traveling")}
          </>
        ) : node.isCurrent ? (
          t("raid.here_btn")
        ) : !node.reachable ? (
          <>
            <Skull className="h-4 w-4" /> {t("raid.alive_boss_ahead")}
          </>
        ) : energy < node.steps ? (
          <>
            <Zap className="h-4 w-4" /> {t("raid.low_energy", { n: node.steps })}
          </>
        ) : (
          <>
            {t("raid.go")}
            <span className="inline-flex items-center gap-0.5 text-xs opacity-80">
              <Zap className="h-3 w-3" />
              {node.steps}
              {(node as { surcharge?: boolean }).surcharge ? " (+1)" : ""}
            </span>
          </>
        )}
      </button>
      )}
      </div>
    </>
  );
}
