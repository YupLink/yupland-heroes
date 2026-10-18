import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { Map as MapIcon, Zap, X, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getRaidFullMap } from "@/server/api/raid-map";
import { raidTravel } from "@/server/api/raid-travel";
import { Center } from "./RaidHeader";
import { BraidedMap } from "./RaidBraidedMap";
import { FullMapLocation } from "./RaidFullMapLocation";
import { FullMapNodeSheet } from "./RaidFullMapNodeSheet";
import type { getRaidLeaderboard } from "@/server/api/raid-leaderboard";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { humanError } from "@/lib/humanError";

type FullMapT = Awaited<ReturnType<typeof getRaidFullMap>>;
type FullLocT = FullMapT["locations"][number];
type FullNodeT = FullLocT["nodes"][number];

export function FullMapModal({
  currentLocId,
  onClose,
  onTraveled,
}: {
  currentLocId: string;
  onClose: () => void;
  onTraveled: (locationId: string) => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<{ node: FullNodeT; loc: FullLocT } | null>(null);
  const map = useQuery({
    queryKey: ["raid-fullmap"],
    queryFn: () => getRaidFullMap(),
    refetchInterval: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const travel = useMutation({
    mutationFn: (targetNodeId: string) => raidTravel({ data: { targetNodeId } }),
    onSuccess: (r) => {
      toast.success(r.spent > 0 ? t("raid.travel_spent", { n: r.spent }) : t("raid.already_here"));
      onTraveled(r.locationId);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Общий баланс, а не снимок карты: бейдж расходился с шапкой, и переезд
  // блокировался при уже накопленной энергии.
  const energy = useEnergy().data?.energy ?? map.data?.energy ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loaded = !!map.data;
  const curNodeId = map.data?.current?.nodeId ?? null;
  useEffect(() => {
    if (!loaded || typeof document === "undefined") return;
    const t = setTimeout(() => {
      const el =
        document.querySelector('[data-fm-current="1"]') ??
        document.querySelector('[data-current="1"]');
      el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [loaded, curNodeId]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0e1420]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 560px at 12% -4%, rgba(245,196,81,.16), transparent 58%)," +
            "radial-gradient(920px 660px at 104% 106%, rgba(65,211,198,.14), transparent 55%)," +
            "radial-gradient(150% 130% at 50% 0%, transparent 52%, rgba(0,0,0,.55) 100%)," +
            "linear-gradient(180deg, #16203200, #0e1420)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(130,160,210,.7) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(130,160,210,.7) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
        }}
      />
      <div className="relative z-10 flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <MapIcon className="h-5 w-5 text-gold" />
        <span className="font-display text-lg font-bold">{t("raid.full_map")}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold">
          <Zap className="h-3.5 w-3.5" /> {energy}
        </span>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition active:scale-95"
        >
          <X className="h-4 w-4" /> {t("raid.close")}
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-40">
        {map.isLoading && (
          <Center>
            <Loader2 className="h-6 w-6 animate-spin" />
          </Center>
        )}
        {!map.isLoading && (map.data?.locations ?? []).length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("raid.no_active_locations")}
          </div>
        )}
        {!map.isLoading && (map.data?.locations ?? []).length > 0 && (
          <>
            {(map.data as { isAdmin?: boolean })?.isAdmin ? (
              <BraidedMap
                data={map.data!}
                selId={sel?.node.id ?? null}
                onPickFor={(loc) => (node) =>
                  setSel((cur) =>
                    cur?.node.id === node.id ? null : { node, loc }
                  )
                }
              />
            ) : (
            <>
            {(() => {
              const all = map.data?.locations ?? [];
              const tops = all.filter((l) => !l.parentLocationId);
              const kids = (pid: string) => all.filter((l) => l.parentLocationId === pid);
              const onPick = (loc: FullLocT) => (node: FullNodeT) =>
                setSel((cur) => (cur?.node.id === node.id ? null : { node, loc }));
              return (
                <div className="space-y-3">
                  {tops.map((loc) => {
                    const children = kids(loc.id);
                    return (
                      <div key={loc.id} className="space-y-2">
                        <FullMapLocation
                          loc={loc}
                          isPlayerLoc={loc.isCurrent}
                          selId={sel?.node.id ?? null}
                          onPick={onPick(loc)}
                        />
                        {children.length > 0 && (
                          <div className="ml-3 space-y-2 border-l-2 border-gold/30 pl-3">
                            {children.map((ch) => (
                              <FullMapLocation
                                key={ch.id}
                                loc={ch}
                                isPlayerLoc={ch.isCurrent}
                                selId={sel?.node.id ?? null}
                                onPick={onPick(ch)}
                                nested
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-sm font-semibold text-muted-foreground transition active:scale-[0.99]"
            >
              {t("raid.close_map")}
            </button>
          </>
        )}
      </div>

      {sel && (
        <FullMapNodeSheet
          node={sel.node}
          loc={sel.loc}
          energy={energy}
          pending={travel.isPending}
          onGo={() => travel.mutate(sel.node.id)}
          onClose={() => setSel(null)}
        />
      )}
    </div>,
    document.body
  );
}
