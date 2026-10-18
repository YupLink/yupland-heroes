import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitFork, Map as MapIcon, ArrowRight, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { chooseRaidLocation } from "@/server/api/raid-nav";
import { humanError } from "@/lib/humanError";

export function RaidForkSection({
  s,
  onGoLocation,
}: {
  s: {
    forkImageUrl: string | null;
    forkLinks: Array<{ locationId: string; name: string; imageUrl: string | null }> | null;
    energy: number;
  };
  onGoLocation: (locationId: string) => void;
}) {
  const t = useT();
  const goFork = useMutation({
    mutationFn: (locationId: string) => chooseRaidLocation({ data: { locationId } }),
    onSuccess: (_r, locationId) => onGoLocation(locationId),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="overflow-hidden rounded-3xl border border-gold/25 bg-card shadow-card">
      {s.forkImageUrl && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary">
          <img src={s.forkImageUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        </div>
      )}
      <div className="p-5">
        <div className="mb-3 flex items-center justify-center gap-2">
          <GitFork className="h-6 w-6 text-gold" />
          <span className="font-display text-lg font-bold">{t("raid.fork_choose")}</span>
        </div>
        {!s.forkLinks || s.forkLinks.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            {t("raid.no_paths")}
          </div>
        ) : (
          <div className="space-y-2">
            {s.forkLinks.map((fl) => (
              <button
                key={fl.locationId}
                onClick={() => goFork.mutate(fl.locationId)}
                disabled={goFork.isPending || s.energy < 1}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/60 p-2.5 text-left transition hover:border-gold/40 disabled:opacity-50"
              >
                {fl.imageUrl ? (
                  <img src={fl.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <MapIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-bold">{fl.name}</span>
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Zap className="h-3 w-3" />1
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
