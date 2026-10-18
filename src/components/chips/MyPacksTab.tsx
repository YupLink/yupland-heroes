import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Sparkles, Loader2, Box } from "lucide-react";
import { openChipPack, openChipPacks, myChipPackGrants } from "@/server/api/chips-pack";
import { listMyMysticPacks } from "@/server/api/mystic";
import { MysticBoxesSection } from "@/components/MysticBoxesSection";
import { PackRevealModal } from "./PackRevealModal";
import { OpenPackConfirmModal } from "./OpenPackConfirmModal";
import { humanError } from "@/lib/humanError";
import { PackNftInputAction } from "./PackNftInputAction";

type RevealItem = Awaited<ReturnType<typeof openChipPack>>["results"][number];
// Что игрок собирается открыть: пак + сколько штук за раз (пачка = один вопрос).
type PendingOpen = {
  chipPackId: string;
  packName: string;
  packImageUrl: string | null;
  count: number;
};

export function MyPacksTab({ giftPack }: { giftPack?: { giftId: string; packId: string } | null } = {}) {
  const t = useT();
  const qc = useQueryClient();
  const [reveal, setReveal] = useState<{ title: string; items: RevealItem[] } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<PendingOpen | null>(null);
  const giftOpened = useRef(false);
  const packs = useQuery({ queryKey: ["my-chip-packs"], queryFn: () => myChipPackGrants() });
  const boxes = useQuery({ queryKey: ["my-mystic-packs"], queryFn: () => listMyMysticPacks() });
  const openMany = useMutation({
    mutationFn: (args: { chipPackId: string; count: number }) => openChipPacks({ data: args }),
    onSuccess: (r, vars) => {
      setConfirmOpen(null);
      const pack = packs.data?.find((g) => g.chipPackId === vars.chipPackId);
      setReveal({
        title:
          r.opened === 1
            ? (pack?.packName ?? t("chips.opened"))
            : `${pack?.packName ?? t("chips.opened")} ×${r.opened}`,
        items: r.results,
      });
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    },
    onError: (e: Error) => {
      setConfirmOpen(null);
      toast.error(humanError(e));
    },
  });

  useEffect(() => {
    if (!giftPack || giftOpened.current || packs.isFetching || packs.isError || !packs.data) return;
    const granted = packs.data.find((grant) => grant.sourceRef === `gift:${giftPack.giftId}:p0` && !grant.openedAt);
    if (!granted) return;
    giftOpened.current = true;
    setConfirmOpen({ chipPackId: granted.chipPackId, packName: granted.packName, packImageUrl: granted.packImageUrl, count: 1 });
  }, [giftPack, packs.data, packs.isError, packs.isFetching]);

  const confirmNode = confirmOpen ? (
    <OpenPackConfirmModal
      packName={confirmOpen.packName}
      imageUrl={confirmOpen.packImageUrl}
      count={confirmOpen.count}
      pending={openMany.isPending}
      onCancel={() => setConfirmOpen(null)}
      onConfirm={() =>
        openMany.mutate({ chipPackId: confirmOpen.chipPackId, count: confirmOpen.count })
      }
    />
  ) : null;

  const revealNode =
    reveal && typeof document !== "undefined"
      ? createPortal(
          <PackRevealModal
            items={reveal.items}
            title={reveal.title}
            onClose={() => setReveal(null)}
          />,
          document.body,
        )
      : null;

  if (packs.isLoading) {
    return (
      <div className="space-y-4 py-8">
        <div className="flex justify-end"><PackNftInputAction /></div>
        <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        {confirmNode}
        {revealNode}
      </div>
    );
  }
  const rows = packs.data ?? [];
  const unopened = rows.filter((r) => !r.openedAt);
  const unopenedBoxes = (boxes.data ?? []).filter((b) => !b.opened);
  const isAllOpened = unopened.length === 0 && unopenedBoxes.length === 0;
  const waitingCount = unopened.length + unopenedBoxes.length;

  type StackedPack = {
    chipPackId: string;
    packName: string;
    packImageUrl: string | null;
    count: number;
    grantIds: string[];
  };
  const stackMap = new Map<string, StackedPack>();
  for (const g of unopened) {
    const ex = stackMap.get(g.chipPackId);
    if (ex) {
      ex.count++;
      ex.grantIds.push(g.id);
    } else {
      stackMap.set(g.chipPackId, {
        chipPackId: g.chipPackId,
        packName: g.packName,
        packImageUrl: g.packImageUrl,
        count: 1,
        grantIds: [g.id],
      });
    }
  }
  const stacks = Array.from(stackMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex min-h-11 items-center justify-between gap-2">
        {boxes.isSuccess && waitingCount > 0 && (
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold">
            <Sparkles className="h-3 w-3 shrink-0" />
            {t("chips.waiting_to_open", { n: waitingCount })}
          </div>
        )}
        <PackNftInputAction />
      </div>
      <MysticBoxesSection initialPackId={giftPack?.packId} />
      {isAllOpened && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-secondary/20 p-8 text-center text-sm text-muted-foreground">
          {t("chips.all_packs_opened")}
        </div>
      )}
      {unopened.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stacks.map((s) => (
              <div
                key={s.chipPackId}
                className="overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent text-center shadow-gold"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-secondary/40">
                  {s.packImageUrl ? (
                    <img src={s.packImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Box className="h-8 w-8" />
                    </div>
                  )}
                  {s.count > 1 && (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-[0_0_10px_rgba(244,63,94,0.6)]">
                      ×{s.count}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2">
                  <div className="truncate text-sm font-medium">{s.packName}</div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmOpen({
                          chipPackId: s.chipPackId,
                          packName: s.packName,
                          packImageUrl: s.packImageUrl,
                          count: 1,
                        })
                      }
                      disabled={openMany.isPending}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg gradient-gold px-2 py-1.5 text-[11px] font-bold text-gold-foreground transition hover:scale-[1.02] disabled:opacity-50"
                    >
                      {openMany.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {t("chips.open")}
                    </button>
                    {s.count > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmOpen({
                            chipPackId: s.chipPackId,
                            packName: s.packName,
                            packImageUrl: s.packImageUrl,
                            count: Math.min(s.count, 50),
                          })
                        }
                        disabled={openMany.isPending}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/10 px-2 py-1.5 text-[11px] font-bold text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50"
                        title={s.count > 50 ? t("chips.open_cap_hint") : t("chips.open_all")}
                      >
                        {s.count > 50
                          ? t("chips.open_n", { n: 50 })
                          : t("chips.all_n", { n: s.count })}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {confirmNode}
      {revealNode}
    </div>
  );
}
