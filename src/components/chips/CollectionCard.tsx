import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ArrowRight, FolderHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ClaimFarmFn } from "@/components/chips/collectionsHelpers";
import { labelForLevel } from "@/components/chips/levelLabel";
import { fmtTickets, fmtFarm, fmtBurnedPct, Badge } from "@/components/chips/collectionsHelpers";
import { humanError } from "@/lib/humanError";
import { farmView, fmtCountdown } from "@/components/chips/collectionFarmView";
import { goldForEarnedTickets } from "@/lib/ticketGold";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";

/** Ферма считает в билетах, игрок видит золото ×100 (ПРАВИЛА §8.61). */
const g = goldForEarnedTickets;

function CollectionCard({
  collection,
  farm,
  onOpen,
  claimFn,
}: {
  collection: {
    id: string;
    name: string;
    coverImageUrl: string | null;
    mintedCount: number;
    initialSupply: number;
    progress: number;
    /** Сожжено — приходит из общего списка коллекций, показываем если есть. */
    burnedCount?: number;
    burnedPercent?: number;
  };
  farm: {
    collectionId: string;
    minLevel: number;
    ratePerDay: number;
    accrued: number;
    totalClaimed: number;
    lastClaimAtMs: number;
    cooldownRemainMs: number;
    canClaim: boolean;
    /** Потолок копилки, суток: с 16.10 сервер его не шлёт — потолка нет. */
    capDays?: number;
    templateCount: number;
    perTemplate: Array<{ templateId: string; bestLevel: number }>;
  } | null;
  onOpen: () => void;
  /**
   * Чем собирать. Не задан — собрать отсюда нельзя: билеты за коллекции
   * забирают в музее на карте (решение владельца 05.09), а раздел «Фишки»
   * остаётся витриной накопления.
   */
  claimFn?: ClaimFarmFn;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!farm) return;
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [farm]);

  const claim = useMutation({
    mutationFn: () => {
      if (!claimFn) throw new Error("chips.claim_in_museum");
      return claimFn(collection.id);
    },
    onSuccess: (r) => {
      toast.success(
        t("chips.farm_claimed", {
          tickets: fmtTickets(r.claimedGold ?? g(r.claimedTickets)),
          level: labelForLevel(r.minLevel),
          rate: fmtTickets(g(r.ratePerDay)),
        }) + (r.bonusPct ? " · " + t("chips.museum_bonus", { n: r.bonusPct }) : ""),
      );
      qc.invalidateQueries({ queryKey: ["my-collection-farms"] });
      qc.invalidateQueries({ queryKey: ["my-resources"] });
      // Музей читает СВОЙ запрос — без этого кнопка «Собрать» остаётся гореть
      // после сбора, хотя кулдаун уже пошёл.
      qc.invalidateQueries({ queryKey: ["beta-museum"] });
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // Отказ «Собрать можно через N» = данные устарели (по факту уже собрано).
      // Освежаем, чтобы кнопка сменилась на таймер, а не звала жать впустую.
      qc.invalidateQueries({ queryKey: ["my-collection-farms"] });
      qc.invalidateQueries({ queryKey: ["beta-museum"] });
    },
  });

  const tplBest = farm?.perTemplate ?? [];
  const total = farm?.templateCount ?? 0;
  const at3 = tplBest.filter((p) => p.bestLevel >= 3).length;
  const at4 = tplBest.filter((p) => p.bestLevel >= 4).length;
  const at5 = tplBest.filter((p) => p.bestLevel >= 5).length;

  const { accruedNow, capDays, capFull, cooldownSec, canClaim } = farmView(farm);
  const fmtSec = fmtCountdown;

  const farmRules = t("chips.farm_rules");

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-3 transition hover:border-gold/40">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        {collection.coverImageUrl ? (
          <img
            src={collection.coverImageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-border bg-secondary object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground">
            <FolderHeart className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate font-display text-base font-bold">{collection.name}</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHelpOpen(true);
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-secondary/60 text-[9px] font-bold text-muted-foreground transition hover:text-gold"
              aria-label={t("chips.farm_rules_aria")}
            >
              ?
            </button>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {t("chips.minted_of", {
              minted: (collection.mintedCount ?? 0).toLocaleString("ru-RU"),
              total: (collection.initialSupply ?? 0).toLocaleString("ru-RU"),
            })}
            {(collection.burnedCount ?? 0) > 0 && (
              <>
                {" · 🔥 "}
                {(collection.burnedCount ?? 0).toLocaleString("ru-RU")} (
                {fmtBurnedPct(collection.burnedPercent ?? 0)})
              </>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {farm && total > 0 && (
        <div className="mt-3 rounded-xl border border-border/60 bg-secondary/20 p-2.5 text-[11px]">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge label="3★" filled={at3} total={total} rate={g(0.1)} />
            <Badge label="4★" filled={at4} total={total} rate={g(0.5)} />
            <Badge label="5★" filled={at5} total={total} rate={g(1.0)} />
          </div>

          {farm.ratePerDay > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-mono font-bold text-gold">{fmtFarm(g(accruedNow))} <ResourceGlyph kind="gold" className="h-3.5 w-3.5" /></div>
                <div className="text-[10px] text-muted-foreground">
                  {t("chips.per_day", { n: fmtTickets(g(farm.ratePerDay)) })} ·{" "}
                  {t("chips.claimed_total", { n: fmtFarm(g(farm.totalClaimed)) })}
                </div>
                {capDays != null && (
                  <div
                    className={cn(
                      "text-[10px]",
                      capFull ? "font-semibold text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {capFull
                      ? t("chips.farm_cap_full", { n: capDays })
                      : t("chips.farm_cap", { n: capDays })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  claim.mutate();
                }}
                disabled={!claimFn || !canClaim || claim.isPending}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition",
                  canClaim
                    ? "gradient-gold text-gold-foreground shadow-gold hover:scale-[1.03]"
                    : "border border-border bg-secondary/50 text-muted-foreground",
                )}
              >
                {claim.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : !claimFn ? (
                  t("chips.claim_in_museum_short")
                ) : canClaim ? (
                  t("chips.claim")
                ) : cooldownSec > 0 ? (
                  fmtSec(cooldownSec)
                ) : (
                  t("chips.start")
                )}
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">{t("chips.farm_inactive")}</div>
          )}
        </div>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="mx-3 mb-[calc(72px+env(safe-area-inset-bottom))] mt-3 max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-gold/30 bg-card p-4 text-xs leading-relaxed sm:mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 font-display text-sm font-bold text-gold">
              {t("chips.how_farm_works")}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-foreground/90">{farmRules}</pre>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-3 w-full rounded-lg border border-border bg-secondary/50 py-2 text-xs font-medium"
            >
              {t("chips.got_it")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CollectionCard };
