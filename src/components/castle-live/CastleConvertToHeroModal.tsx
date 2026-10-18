import { Button } from "@/components/ui/button";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
// Превращение фишки в героя — окно замка (дизайн Ангелины, 07.10.2026): баланс
// лайков и проверка фишки до кнопки. Игроки вне замка видят прежнее окно
// (heroes/ConvertToHeroModal) — до открытия замка всем.
//
//
// Результат НЕ закрывается сам: игрок должен рассмотреть, кто ему выпал,
// и закрыть окно кнопкой (просьба владельца 21.08).
import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { myLikeBalance } from "@/server/api/likes";
import { myChipInventory } from "@/server/api/chips-pack";
import { TavernDialog } from "@/components/castle-live/TavernDialog";
import { Loader2, Sparkles } from "lucide-react";
import { ChipImage } from "@/components/ChipImage";
import { toast } from "sonner";
import { convertChipToHero } from "@/server/api/heroes";
import { useLang } from "@/lib/i18n";
import { convertRuleForChipLevel } from "@/lib/heroLevels";
import { HeroRadar } from "@/components/heroes/HeroRadar";
import { RARITY_COLOR, RARITY_LABEL } from "@/components/heroes/heroLabels";
import { thumb } from "@/lib/image";
import type { HeroStats } from "@/lib/heroStats";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";

type Result = {
  heroId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  specialization: string | null;
  rarity: string;
  stats: HeroStats;
  spentLikes: number;
  likesLeft: number;
};

export function CastleConvertToHeroModal({
  chipId,
  chipLevel,
  chipName,
  chipImageUrl,
  onClose,
  onResultClose,
  returnFocusRef,
}: {
  chipId: string;
  chipLevel: number;
  chipName: string;
  chipImageUrl?: string | null;
  onClose: () => void;
  onResultClose?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const qc = useQueryClient();
  // Окно необратимое (фишка сгорает), а в таверну замка оно приходит из
  // англоязычного «Create a hero» — свои подписи держим на двух языках.
  const ru = useLang() === "ru";
  const [result, setResult] = useState<Result | null>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (result) doneButton.current?.focus(); }, [result]);
  const rule = convertRuleForChipLevel(chipLevel);
  const likes = useQuery({ queryKey: ["my-like-balance"], queryFn: () => myLikeBalance(), refetchOnMount: "always" });
  const inventory = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory(), refetchOnMount: "always" });
  const chipOwned = inventory.data?.some(group => group.level === chipLevel && group.chips.some(chip => chip.id === chipId && !chip.studying)) ?? false;
  const chipReady = inventory.isSuccess && !inventory.isFetching && chipOwned;
  const available = likes.isSuccess && likes.data?.available != null ? Number(likes.data.available) : null;
  const balanceReady = available !== null && Number.isFinite(available) && !likes.isFetching;
  const balanceError = likes.isError || (likes.isSuccess && !likes.isFetching && !balanceReady);
  const poor = balanceReady && !!rule && available! < rule.likes;

  const convert = useMutation({
    mutationFn: () =>
      convertChipToHero({
        data: { chipId },
      }),
    onSuccess: (r) => {
      setResult(r as unknown as Result);
      // Окно результата держится, пока игрок его не закроет, — а списки за
      // ним обязаны уже быть новыми: герой в инвентаре, фишка сожжена, лайки
      // списаны. Единый список ключей — lib/query.
      invalidateHeroQueries(qc, ["my-like-balance", "my-chip-inventory"]);
    },
    onError: (e: Error) => {
      invalidateHeroQueries(qc, ["my-like-balance", "my-chip-inventory"]);
      toast.error(humanError(e));
    },
  });

  const color = result ? (RARITY_COLOR[result.rarity] ?? "#9aa4bd") : "#9aa4bd";

  return (
    <TavernDialog
        title={result ? (ru ? "Герой создан" : "Hero created") : (ru ? "Превратить в героя" : "Convert to a hero")}
        onClose={onClose}
        locked={!!result || convert.isPending}
        returnFocusRef={returnFocusRef}
        overlayClassName="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4"
        variant="convert"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain border border-gold/30 bg-card p-4"
      >
        {!result ? (
          <>
            <div data-convert-heading className="mb-3 flex items-center gap-2">
              <ChipImage src={chipImageUrl ?? ""} level={chipLevel} alt="" className="h-[72px] w-[72px] shrink-0" />
              <div className="min-w-0">
                <div data-convert-title className="text-sm font-bold">
                  {ru ? "Превратить в героя" : "Convert to a hero"}
                </div>
                <div data-convert-chip-name className="break-words text-sm leading-snug text-muted-foreground">
                  {chipName} · {chipLevel}★
                </div>
              </div>
            </div>

            <div data-convert-result className="mt-3 text-xs">
              <p data-convert-eyebrow className="font-medium">{ru ? "Что получишь" : "What you get"}</p>
              <p data-convert-rarity>{chipLevel}★ <span aria-hidden="true">→</span> <strong>{rule ? RARITY_LABEL[rule.rarity] : "—"} {ru ? "герой" : "hero"}</strong></p>
              <p data-convert-note className="mt-1 text-muted-foreground">
                {ru
                  ? "Герой выбирается из коллекции этой фишки. Кто именно и какая специализация — узнаешь после превращения."
                  : "A hero is selected from this chip’s collection. The specific hero and specialization are revealed after conversion."}
              </p>
            </div>
            <div data-convert-cost className="flex items-center justify-between py-3 text-xs">
              <span className="font-medium">{ru ? "Стоимость" : "Cost"}</span>
              <span className="font-bold text-gold tabular-nums">
                {rule?.likes.toLocaleString(ru ? "ru" : "en") ?? "—"} {ru ? "лайков" : "likes"}
              </span>
            </div>
            <div data-convert-balance className="mt-2 text-sm" aria-live="polite">
              {balanceError ? <div role="alert">
                <p>{ru ? "Не удалось загрузить баланс лайков." : "Could not load your likes balance."}</p>
                <button data-game-button="secondary" className="min-h-11 underline" onClick={() => void likes.refetch()}>{ru ? "Повторить" : "Retry"}</button>
              </div> : !balanceReady ? <p role="status">{ru ? "Загружаем баланс лайков…" : "Loading likes balance…"}</p> : <>
                <p data-convert-available>{ru ? "У тебя: " : "Available: "}{available!.toLocaleString(ru ? "ru" : "en")} <ResourceGlyph kind="likes" label={ru ? "лайки" : "likes"} className="h-4 w-4" /></p>
                {poor && rule && <p className="text-destructive">
                  {ru ? "Не хватает: " : "Missing: "}
                  {(rule.likes - available!).toLocaleString(ru ? "ru" : "en")} <ResourceGlyph kind="likes" label={ru ? "лайки" : "likes"} className="h-4 w-4" />
                </p>}
              </>}
            </div>
            <p data-convert-warning className="mt-2 text-[11px] text-destructive">
              {ru
                ? "Эта фишка исчезнет, а лайки будут списаны. Отменить превращение нельзя."
                : "This chip will be consumed and likes deducted. Conversion cannot be undone."}
            </p>
            {!chipReady && <div role={inventory.isFetching ? "status" : "alert"} className="mt-2 text-xs text-muted-foreground">
              <p>{inventory.isFetching ? (ru ? "Проверяем фишку…" : "Checking the chip…") : inventory.isError ? (ru ? "Не удалось проверить фишку." : "Could not verify the chip.") : (ru ? "Фишка больше не доступна для превращения." : "The chip is no longer available for conversion.")}</p>
              {!inventory.isFetching && <button data-game-button="secondary" type="button" onClick={() => void inventory.refetch()}>{ru ? "Повторить" : "Retry"}</button>}
            </div>}

            <div data-convert-actions className="mt-3 flex gap-2">
              <Button data-game-button="primary"
                data-convert-submit
                onClick={() => convert.mutate()}
                disabled={convert.isPending || !rule || !balanceReady || poor || !chipReady}
                className="min-h-11 whitespace-normal flex flex-[2] items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2.5 text-xs font-bold text-gold-foreground transition active:scale-[0.99] disabled:opacity-50"
              >
                {convert.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {ru
                  ? `Превратить за ${rule?.likes ?? "—"} лайков`
                  : `Convert for ${rule?.likes ?? "—"} likes`}
              </Button>
              <Button data-game-button="secondary"
                data-convert-cancel
                onClick={onClose}
                disabled={convert.isPending}
                variant="outline"
                className="min-h-11 flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-medium transition hover:bg-secondary"
              >
                {ru ? "Отмена" : "Cancel"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              {result.imageUrl ? (
                <img
                  src={thumb(result.imageUrl, 220, "black")}
                  alt=""
                  className="h-28 w-28 rounded-2xl object-cover ring-2"
                  style={{ boxShadow: `0 0 26px ${color}55` }}
                />
              ) : (
                <span className="grid h-28 w-28 place-items-center rounded-2xl bg-secondary text-4xl">
                  ♞
                </span>
              )}
              <div className="text-center">
                <div className="font-display text-lg font-bold">{result.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[result.race, result.specialization].filter(Boolean).join(" · ")}
                </div>
                <span
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: color + "22", color }}
                >
                  {RARITY_LABEL[result.rarity] ?? result.rarity}
                </span>
              </div>
            </div>

            <div className="flex justify-center py-1">
              <HeroRadar stats={result.stats} size={230} />
            </div>

            <Button data-game-button="primary"
              ref={doneButton}
              onClick={onResultClose ?? onClose}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-3 text-sm font-bold text-gold-foreground transition active:scale-[0.99]"
            >
              {ru ? "Отлично" : "Done"}
            </Button>
          </>
        )}
    </TavernDialog>
  );
}
