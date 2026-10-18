// «Какой артефакт отдать» — выбор КОНКРЕТНОГО артефакта под позицию скупки
// «любой артефакт редкости X».
//
// ПОЧЕМУ выбирает игрок. У обычных артефактов разные статы, и «сервер возьмёт
// самый старый» — это лотерея, а не сделка: за золото уходил бы тот, который
// игрок берёг. Список свободных даёт listSellableArtifacts (надетые в него не
// попадают), выбранный шаблон уезжает в sellMarketItem как pick.
//
// Попап рисуется ПОРТАЛОМ в body и z-140 — как MarketRefPicker: окно маркета
// стоит под backdrop-blur, и вложенный попап тот обрезал бы вместе с кнопкой.
//
// Состояний ТРИ, и их нельзя путать: «грузим», «не смогли спросить» (можно
// повторить) и «сдавать нечего» (пусто по-настоящему). Слитые в одно, они
// однажды уже соврали владельцу «нечего сдать» при ста шестнадцати артефактах.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ImageOff, Loader2, RotateCw, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { listSellableArtifacts } from "@/server/api/beta-raid/artifacts-sellable";
import { numText } from "./num";
import type { ArtRarity } from "./artAnyIcon";

/** Что выбрал игрок: шаблон, его имя для подписи и сколько свободных штук. */
export type ArtChoice = { templateId: string; name: string; count: number };

/** Префикс ключа кэша — сделка меняет состав инвентаря, список надо сбрасывать. */
export const SELLABLE_ARTS_KEY = ["sellable-arts"] as const;

type Sellable = Awaited<ReturnType<typeof listSellableArtifacts>>[number];

export function MarketArtPick({
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
  // Выделение в попапе — целым объектом: «Выбрать» применяет именно его и не
  // зависит от того, дожил ли шаблон до рефетча списка.
  const [picked, setPicked] = useState<Sellable | null>(null);
  const q = useQuery({
    queryKey: [...SELLABLE_ARTS_KEY, rarity],
    queryFn: () => listSellableArtifacts({ data: { rarity } }),
    // Инвентарь меняется редко, а плиток одной редкости на витрине бывает
    // несколько — общий кэш экономит запросы при каждом открытии маркета.
    staleTime: 30_000,
    retry: 2,
  });
  const list = q.data ?? [];
  // Три РАЗНЫХ состояния, а не два. Раньше сервер глушил сбой запроса пустым
  // списком, и «база не ответила» выглядело как «сдавать нечего»: кнопка
  // гасла, ложная пустота ложилась в кэш на полминуты, повторить было нечем.
  // Теперь сбой виден отдельно и его можно перезапросить.
  const failed = q.isError;
  const empty = !q.isLoading && !failed && list.length === 0;

  // На плитке подписи короткие (грид 3-в-ряд), в title — полная фраза: на ПК
  // она всплывает подсказкой, а на телефоне её договаривает попап.
  const label = q.isLoading
    ? "…"
    : failed
      ? t("market.art_pick_error_short")
      : empty
        ? t("market.art_pick_none_short")
        : (value?.name ?? t("market.art_pick_short"));
  const hint = failed
    ? t("market.art_pick_error")
    : empty
      ? t("market.art_pick_none")
      : (value?.name ?? t("market.art_pick"));

  return (
    <>
      <button
        type="button"
        // Сбой кнопку НЕ гасит: попап под ней объясняет причину и даёт
        // повторить. Гасить нечего только когда сдавать действительно нечего.
        disabled={empty || q.isLoading}
        onClick={() => {
          setPicked(list.find((a) => a.templateId === value?.templateId) ?? null);
          setOpen(true);
        }}
        title={hint}
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
                <h4 className="font-display text-sm font-bold">{t("market.art_pick")}</h4>
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
                  // Сбой запроса — с кнопкой повтора: список у игрока есть,
                  // до него просто не доехали, и уходить из маркета незачем.
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                    <p className="text-sm text-muted-foreground">{t("market.art_pick_error")}</p>
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
                    {t("market.art_pick_none")}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {list.map((a) => (
                      <div
                        key={a.templateId}
                        onClick={() => setPicked(a)}
                        className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-1.5 ${
                          a.templateId === picked?.templateId
                            ? "border-gold bg-gold/10"
                            : "border-border"
                        }`}
                      >
                        {a.imageUrl ? (
                          <img
                            // Через уменьшающий прокси: арты лежат
                            // полноразмерными, а плитка тут ~110 px.
                            src={thumb(a.imageUrl, 160)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full rounded-lg border border-border object-contain"
                          />
                        ) : (
                          <div className="grid aspect-square w-full place-items-center rounded-lg border border-border text-muted-foreground">
                            <ImageOff className="h-5 w-5" />
                          </div>
                        )}
                        <span className="truncate text-[11px] leading-tight">{a.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t("market.art_free", { n: numText(a.count) })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <button
                  type="button"
                  disabled={!picked}
                  onClick={() => {
                    if (picked)
                      onPick({
                        templateId: picked.templateId,
                        name: picked.name,
                        count: picked.count,
                      });
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {picked ? `${t("market.pick_apply")}: ${picked.name}` : t("market.art_pick")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
