// Музей: дом на карте для «фарма коллекций» из раздела Фишки.
//
// Механика та же самая: собранные коллекции копят билеты, забираются кнопкой
// «Собрать». Здесь только окно и вход — открывается тапом по достроенному
// музею; сама карточка коллекции — прежняя (chips/CollectionCard), чтобы
// поведение не расходилось.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { claimMuseumFarm, getMuseum } from "@/server/api/beta-raid/museum";
import { CollectionCard } from "@/components/chips/CollectionCard";

export function MuseumModal({ q, r, onClose }: { q: number; r: number; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["beta-museum", q, r],
    queryFn: () => getMuseum({ data: { q, r } }),
    refetchInterval: 60_000,
    retry: false,
  });

  const items = info.data?.collections ?? [];
  const active = items.filter((x) => x.farm.ratePerDay > 0);
  const idle = items.filter((x) => x.farm.ratePerDay === 0);
  const refetch = () => qc.invalidateQueries({ queryKey: ["beta-museum"] });
  // Собирают билеты ТОЛЬКО здесь: ручка знает клетку, а значит и тир — с
  // третьего он добавляет по 20% к сбору.
  const claimFn = (collectionId: string) => claimMuseumFarm({ data: { q, r, collectionId } });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-gold" />
          <b className="flex-1 truncate">{info.data?.here.name ?? t("braid.museum_title")}</b>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {info.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {info.error && (
          <p className="py-6 text-center text-sm text-destructive">{humanError(info.error)}</p>
        )}

        {info.data && (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              {info.data.here.built ? t("braid.museum_hint") : t("braid.museum_preview_note")}
            </p>

            {active.length > 0 ? (
              <section className="space-y-1.5" onClick={refetch}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("braid.museum_farming", { n: active.length })}
                </h3>
                <div className={info.data.here.built ? "" : "pointer-events-none opacity-70"}>
                  {active.map((x) => (
                    <CollectionCard
                      claimFn={info.data?.here.built ? claimFn : undefined}
                      key={x.collection.id}
                      collection={x.collection}
                      farm={x.farm}
                      onOpen={() => {
                        /* деталь коллекции живёт во вкладке Фишки — тут только сбор */
                      }}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">
                {t("braid.museum_none_active")}
              </p>
            )}

            {idle.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("braid.museum_idle", { n: idle.length })}
                </h3>
                <p className="text-[10px] text-muted-foreground">{t("braid.museum_idle_hint")}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
