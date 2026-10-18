// Окно постройки: что стоит следующий тир и кому это позволено.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { thumb } from "@/lib/image";
import { getBuildingOffer, buildNextTier } from "@/server/api/beta-raid/building-action";
import { humanError } from "@/lib/humanError";
import { invalidateRaidMap, invalidateBackpack } from "@/lib/query";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { metaLabel } from "@/components/heroMeta";
import { BuildingExtraActions } from "./BuildingExtraActions";
import { BuildingTravelAction } from "./BuildingTravelAction";
import { useCastleMode } from "./castleMode";
import { getHomeCastle } from "@/server/api/beta-raid/home-castle";
import { TownExtra } from "./town/TownExtra";
import { isTownExtra, type TownHallExtra } from "@/lib/townHallView";
import { priceLabel, type BuildingExtra, type ServicePrice } from "@/lib/buildingEffect";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import type { MapData } from "./useBetaRaidData";
import { priceText as resourceListText } from "./portalPriceText";
import type { PortalPrice } from "@/lib/portal";

export function BuildModal({
  q,
  r,
  onClose,
  onGoTo,
}: {
  q: number;
  r: number;
  onClose: () => void;
  /**
   * Пойти сюда: закрывает окно и просит внешнюю систему проложить путь.
   * Владелец 14.09: «нажимая на табличку можно только причитать — сделай
   * ещё функцию Идти, стать на эту клетку». Полезно для многих проходимых
   * построек: sign, коврик, пустой алтарь.
   */
  onGoTo?: (q: number, r: number) => void;
}) {
  const castleMode = useCastleMode();
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang();

  // Цена приходит с сервера числом и видом ресурса — фразу собирает интерфейс.
  // Строк может быть несколько («300 дерева · 50 камня»): их складывают, а не
  // выбирают, поэтому перечисляем через точку.
  const priceText = (price: ServicePrice | null) => {
    if (!price) return t("braid.no_price");
    const label = priceLabel(price);
    return t(label.key, label.params);
  };
  const costText = (costs: PortalPrice[] | null | undefined, price: ServicePrice | null) =>
    costs && costs.length > 0 ? resourceListText(costs, t) : priceText(price);

  const offer = useQuery({
    queryKey: ["beta-raid-building", q, r],
    queryFn: () => getBuildingOffer({ data: { q, r } }),
    staleTime: 5_000,
    retry: false,
  });

  const build = useMutation({
    mutationFn: () => buildNextTier({ data: { q, r } }),
    onSuccess: (res) => {
      toast.success(t("braid.built_toast", { name: localizeAssetName(res.name, lang) }));
      // Новый тир рисуем СРАЗУ, не дожидаясь ответа на рефетч: карта тяжёлая,
      // и до её перезагрузки постройка стояла в прежнем облике — «улучшил, а
      // картинка та же».
      qc.setQueryData(["beta-raid-map"], (old: MapData | undefined) =>
        old
          ? { ...old, buildingTiers: { ...(old.buildingTiers ?? {}), [`${q},${r}`]: res.tier } }
          : old,
      );
      invalidateRaidMap(qc);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      // Баланс лайков живёт под ключом my-like-balance: прежний "my-likes"
      // никто не читал, и после постройки число в шапке не менялось.
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      // Ценой бывают добываемые ресурсы, энергия и товар из рюкзака — их
      // счётчики тоже врут после оплаты.
      qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      qc.invalidateQueries({ queryKey: ENERGY_KEY });
      invalidateBackpack(qc);
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const data = offer.data;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[88vh] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("braid.building")}
            </div>
            <h3 className="truncate font-display text-lg font-bold">
              {data?.name
                ? localizeAssetName(data.name, lang)
                : offer.isError
                  ? t("braid.open_failed")
                  : t("braid.loading")}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {offer.isError ? (
          // Раньше здесь крутился вечный спиннер: сервер отвечал «Здесь нет
          // постройки», а окно так и висело «Загружаем…».
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              {/* через humanError: отказ приходит ключом словаря, а сырым в
                  окне читался как «braid.void_blocked» */}
              {offer.error ? humanError(offer.error) : t("braid.building_open_error")}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-2xl border border-border px-4 py-3 text-sm font-semibold"
            >
              {t("common.close")}
            </button>
          </div>
        ) : offer.isLoading || !data ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              {data.imageUrl && (
                <img
                  src={thumb(data.imageUrl, 160, "black")}
                  alt=""
                  className="h-20 w-20 rounded-xl object-contain"
                />
              )}
              {data.nextImageUrl && (
                <>
                  <span className="text-lg text-muted-foreground">→</span>
                  <img
                    src={thumb(data.nextImageUrl, 160, "black")}
                    alt=""
                    className="h-20 w-20 rounded-xl object-contain ring-1 ring-gold/40"
                  />
                </>
              )}
            </div>

            <p className="text-center text-sm">
              {data.final ? (
                <span className="text-muted-foreground">
                  {data.tier === 0 ? t("braid.build_done") : t("braid.build_maxed")}
                </span>
              ) : (
                <b className="text-gold">
                  {t("braid.build_for", {
                    name: data.nextName ?? "",
                    price: costText(data.costs, data.price),
                  })}
                </b>
              )}
            </p>

            {data.requires && (
              <p className="text-center text-[11px] text-muted-foreground">
                {t("braid.requires_hero", {
                  race: data.requires.race
                    ? t("braid.req_race", { race: metaLabel(data.requires.race, lang) })
                    : "",
                  spec: data.requires.spec ? ` · ${metaLabel(data.requires.spec, lang)}` : "",
                })}
              </p>
            )}
            {data.blockReason && (
              <p className="text-center text-[11px] text-destructive">{data.blockReason}</p>
            )}

            {/* Достроенная верфь/вышка умеет больше, чем менять облик. Ратуша и
                постройки голодающего города — своим блоком (town/TownExtra). */}
            {isTownExtra((data.extra ?? null) as BuildingExtra) ? (
              <TownExtra q={q} r={r} extra={data.extra as TownHallExtra} />
            ) : (
              <BuildingExtraActions
                q={q}
                r={r}
                extra={(data.extra ?? null) as BuildingExtra}
                onDone={onClose}
              />
            )}

            {!data.final && (
              <button
                onClick={() => build.mutate()}
                disabled={build.isPending || !data.canBuild}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
              >
                {build.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Hammer className="h-4 w-4" />
                )}
                {t("braid.act_build")}
              </button>
            )}

            <BuildingTravelAction q={q} r={r} ru={lang === "ru"} onClose={onClose}
              onGoTo={onGoTo} enter={castleMode?.enterAt} loadStatus={getHomeCastle} />
          </div>
        )}
      </div>
    </div>
  );
}
