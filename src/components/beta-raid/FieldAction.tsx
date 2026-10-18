// Грядка: кого можно отправить батрачить и что с этого капает.
//
// Сверху — что растёт и сколько в час, рядом число работников. Ниже условие
// приёма («редкие и эпические до 20 уровня») и список ТОЛЬКО тех героев, кто
// под него подходит: показывать заведомо негодных — дразнить игрока.
//
// Поле не захватывают и энергию не тратят: единственная плата — герой, который
// на время работы становится занят.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sprout, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { invalidateHeroQueries } from "@/lib/query";
import { fieldRewardName, fieldRequirementText } from "./fieldText";
import { getFieldState, placeHeroOnField, removeHeroFromField } from "@/server/api/beta-raid/field";
import { FieldMyHero } from "./FieldMyHero";
import { FieldHeroTile } from "./FieldHeroTile";
import { useNowTick } from "@/components/chips/chipBusy";

export function FieldAction({
  q,
  r,
  myHero = null,
}: {
  q: number;
  r: number;
  /** Мой герой на грядке — из окна постройки: оно открывается и издалека,
   *  когда окно поля ещё молчит («сначала подойди к грядке»). */
  myHero?: { id: string; name: string } | null;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  // Отдыхающие гаснут и оживают по тику, без F5.
  const now = useNowTick(10_000);

  const state = useQuery({
    queryKey: ["beta-field", q, r],
    queryFn: () => getFieldState({ data: { q, r } }),
    refetchInterval: 60_000,
    retry: false,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["beta-field", q, r] });
    qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
    // Значок «занято/всего» над полем — сразу, без F5: у запроса нет опроса.
    qc.invalidateQueries({ queryKey: ["beta-raid-field-slots"] });
    // Занят ли герой, видно в списках героев (замок, выбор героя): без этого
    // там ещё минуту висела бы старая пометка «батрачит».
    invalidateHeroQueries(qc);
  };
  // Открытие окна сливает целые единицы урожая на ближайший склад
  // (settleFieldPayout в getFieldState) — бейдж того склада вырос без тапа,
  // а опрос бейджей раз в минуту. Один раз на первый ответ окна, как в
  // WarehouseAction: дальше рефетч окна и опрос бейджей идут в один шаг (60 с).
  const settledOnce = useRef(false);
  useEffect(() => {
    if (!state.dataUpdatedAt || settledOnce.current) return;
    settledOnce.current = true;
    qc.invalidateQueries({ queryKey: ["beta-raid-warehouse-badges"] });
    qc.invalidateQueries({ queryKey: ["my-warehouses"] });
  }, [state.dataUpdatedAt, qc]);

  const place = useMutation({
    mutationFn: (heroId: string) => placeHeroOnField({ data: { q, r, heroId } }),
    onSuccess: (res) => {
      toast.success(t("braid.field_placed", { hero: res.heroName }));
      setPicked(null);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const leave = useMutation({
    mutationFn: () => removeHeroFromField({ data: { q, r } }),
    onSuccess: () => {
      toast.success(t("braid.field_removed"));
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const d = state.data;
  const rewardName = d ? fieldRewardName(d.reward, t) : "";
  const heroes = d?.heroes ?? [];

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      {state.isLoading && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Издалека окно поля не открывается, но кто батрачит — видно и отсюда. */}
      {!d && !state.isLoading && myHero?.id && <FieldMyHero hero={myHero} />}

      {d && (
        <>
          <div className="text-center">
            <div className="text-sm font-bold text-gold">
              {t("braid.field_yield_total", { n: d.yieldAmount, res: rewardName })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("braid.field_workers", { n: d.workers })}
              {d.maxHeroes > 0 && (
                <>
                  {" ("}
                  <b className={d.workers >= d.maxHeroes ? "text-red-400" : "text-emerald-400"}>
                    {d.workers}
                  </b>
                  <span>/{d.maxHeroes}</span>
                  {")"}
                </>
              )}{" "}
              · {t("braid.field_share", { n: round2(d.share), res: rewardName })}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-center text-[11px]">
            <span className="text-muted-foreground">{t("braid.field_who")}: </span>
            {fieldRequirementText(d.requirements, t)}
          </div>

          {d.myHero && (
            <FieldMyHero
              hero={d.myHero}
              known={heroes}
              action={
                <button
                  type="button"
                  onClick={() => leave.mutate()}
                  disabled={leave.isPending}
                  className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground disabled:opacity-50"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  {t("braid.field_remove")}
                </button>
              }
            />
          )}

          <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
            {heroes.length === 0 && (
              <p className="col-span-3 text-center text-[11px] text-muted-foreground">
                {t("braid.field_no_fit")}
              </p>
            )}
            {heroes.map((h) => (
              <FieldHeroTile
                key={h.id}
                hero={h}
                here={`${q},${r}`}
                now={now}
                chosen={picked === h.id}
                onPick={() => setPicked(picked === h.id ? null : h.id)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => picked && place.mutate(picked)}
            disabled={!picked || place.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {place.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sprout className="h-4 w-4" />
            )}
            {t("braid.field_send")}
          </button>
          <p className="text-center text-[10px] text-muted-foreground">
            {t("braid.field_send_note")}
          </p>
          <p className="text-center text-[10px] text-muted-foreground">
            {t("braid.field_to_warehouse")}
          </p>
        </>
      )}
    </div>
  );
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
