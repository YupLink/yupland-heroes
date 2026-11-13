// «Какого героя сдать» — выбор КОНКРЕТНОЙ копии под скупку ломбарда «Любой герой
// редкости X» (владелец, 22.10.2026).
//
// Выбирает игрок, а не сервер: у копий одного шаблона разные уровни, и «возьмём
// любого» отдало бы за золото прокачанного. Список свободных даёт
// listSellableHeroes (основной, на грядке, отдыхающий, рыбачащий и с грибом
// DARAI в рюкзаке в него не попадают; прочие вещи рюкзака после продажи падают
// мешочком на клетку основного героя, §8.73 п. 4). Отметить можно сразу несколько (владелец,
// 23.10.2026: «дать возможность сразу несколько выбирать в редкости»): тап
// включает и выключает копию, count у выбора — сколько отмечено, и столько же
// уходит одной сделкой (pick.heroItemIds в sellMarketItem, сервер проверяет
// каждую копию отдельно).
//
// Попап — порталом в body и z-140, как MarketArtPick: окно маркета под
// backdrop-blur обрезало бы вложенный попап. Три состояния не путаем: «грузим»,
// «не смогли спросить» (повтор) и «сдавать некого».
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ImageOff, Loader2, RotateCw, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { listSellableHeroes } from "@/server/api/beta-raid/heroes-sellable";
import { numText } from "./num";
import type { ArtRarity } from "./artAnyIcon";
import type { ArtChoice } from "./MarketArtPick";

/** Префикс ключа кэша — сделка меняет состав героев, список надо сбрасывать. */
export const SELLABLE_HEROES_KEY = ["sellable-heroes"] as const;

type Sellable = Awaited<ReturnType<typeof listSellableHeroes>>[number];

/** Подпись выбора: один — его имя, несколько — «Героев: N». */
function pickedName(list: Sellable[], t: ReturnType<typeof useT>): string {
  return list.length === 1
    ? (list[0]?.name ?? "")
    : t("market.hero_pick_n", { n: numText(list.length) });
}

export function MarketHeroPick({
  rarity,
  value,
  onPick,
}: {
  rarity: ArtRarity;
  value: ArtChoice | null;
  onPick: (choice: ArtChoice) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Отмеченные — в порядке тапов: убавит игрок степпер — уйдут первые отмеченные.
  const [picked, setPicked] = useState<Sellable[]>([]);
  const isPicked = (h: Sellable) => picked.some((p) => p.itemId === h.itemId);
  const toggle = (h: Sellable) =>
    setPicked((cur) =>
      cur.some((p) => p.itemId === h.itemId)
        ? cur.filter((p) => p.itemId !== h.itemId)
        : [...cur, h],
    );
  const q = useQuery({
    queryKey: [...SELLABLE_HEROES_KEY, rarity],
    queryFn: () => listSellableHeroes({ data: { rarity } }),
    staleTime: 30_000,
    retry: 2,
  });
  const list = q.data ?? [];
  const failed = q.isError;
  const empty = !q.isLoading && !failed && list.length === 0;
  const label = q.isLoading
    ? "…"
    : failed
      ? t("market.art_pick_error_short")
      : empty
        ? t("market.hero_pick_none_short")
        : (value?.name ?? t("market.hero_pick_short"));

  return (
    <>
      <button
        type="button"
        disabled={empty || q.isLoading}
        onClick={() => {
          // Открыли снова — отмечены прежние, если ещё свободны (порядок — прежний).
          const ids = value?.heroItemIds ?? [];
          setPicked(ids.flatMap((id) => list.find((h) => h.itemId === id) ?? []));
          setOpen(true);
        }}
        title={failed ? t("market.hero_pick_error") : (value?.name ?? t("market.hero_pick"))}
        className={`w-full truncate rounded-lg border px-1 py-1 text-[10px] font-semibold leading-tight ${
          empty || failed
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : value
              ? "border-gold/60 bg-gold/10 text-gold"
              : "border-dashed border-gold/60 text-gold"
        }`}
      >
        {label}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <h4 className="font-display text-sm font-bold">{t("market.hero_pick")}</h4>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close")}
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                {q.isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : failed ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                    <p className="text-sm text-muted-foreground">{t("market.hero_pick_error")}</p>
                    <button
                      type="button"
                      onClick={() => void q.refetch()}
                      disabled={q.isFetching}
                      className="flex items-center gap-1.5 rounded-xl border border-gold/60 px-4 py-2 text-sm font-bold text-gold disabled:opacity-50"
                    >
                      {q.isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                      {t("market.retry")}
                    </button>
                  </div>
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("market.hero_pick_none")}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {list.map((h) => (
                      <div
                        key={h.itemId}
                        onClick={() => toggle(h)}
                        className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-1.5 ${
                          isPicked(h) ? "border-gold bg-gold/10" : "border-border"
                        }`}
                      >
                        {h.imageUrl ? (
                          <img
                            src={thumb(h.imageUrl, 160)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full rounded-lg border border-border object-cover"
                          />
                        ) : (
                          <div className="grid aspect-square w-full place-items-center rounded-lg border border-border text-muted-foreground">
                            <ImageOff className="h-5 w-5" />
                          </div>
                        )}
                        {isPicked(h) && (
                          <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-gold text-gold-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <span className="truncate text-[11px] leading-tight">{h.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t("market.hero_level", { n: numText(h.level) })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <button
                  type="button"
                  disabled={picked.length === 0}
                  onClick={() => {
                    const first = picked[0];
                    if (first)
                      onPick({
                        templateId: first.templateId,
                        heroItemIds: picked.map((h) => h.itemId),
                        name: pickedName(picked, t),
                        count: picked.length,
                      });
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {picked.length > 1
                    ? `${t("market.pick_apply")} (${numText(picked.length)})`
                    : picked[0]
                      ? `${t("market.pick_apply")}: ${picked[0].name}`
                      : t("market.hero_pick")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
