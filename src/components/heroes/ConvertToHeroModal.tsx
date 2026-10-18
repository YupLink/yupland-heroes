import { Button } from "@/components/ui/button";
// Превращение фишки в героя: подтверждение → результат.
//
// Результат НЕ закрывается сам: игрок должен рассмотреть, кто ему выпал,
// и закрыть окно кнопкой (просьба владельца 21.08).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { convertChipToHero } from "@/server/api/heroes";
import { useLang } from "@/lib/i18n";
import { convertRuleForChipLevel } from "@/lib/heroLevels";
import { HeroRadar } from "./HeroRadar";
import { RARITY_COLOR, RARITY_LABEL } from "./heroLabels";
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

export function ConvertToHeroModal({
  chipId,
  chipLevel,
  chipName,
  onClose,
  onResultClose,
}: {
  chipId: string;
  chipLevel: number;
  chipName: string;
  onClose: () => void;
  onResultClose?: () => void;
}) {
  const qc = useQueryClient();
  // Окно необратимое (фишка сгорает), а в таверну замка оно приходит из
  // англоязычного «Create a hero» — свои подписи держим на двух языках.
  const ru = useLang() === "ru";
  const [result, setResult] = useState<Result | null>(null);
  const rule = convertRuleForChipLevel(chipLevel);

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
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={result || convert.isPending ? undefined : onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[90vh] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!result ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold">
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold">
                  {ru ? "Превратить в героя" : "Convert to a hero"}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {chipName} · {chipLevel}★
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3 text-xs">
              <span className="font-medium">{rule ? RARITY_LABEL[rule.rarity] : "—"}</span>
              <span className="font-bold text-gold tabular-nums">
                {rule?.likes.toLocaleString(ru ? "ru" : "en") ?? "—"} {ru ? "лайков" : "likes"}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-destructive">
              {ru
                ? "Эта фишка исчезнет, а лайки будут списаны. Отменить превращение нельзя."
                : "This chip will be consumed and likes deducted. Conversion cannot be undone."}
            </p>

            <div className="mt-3 flex gap-2">
              <Button
                onClick={onClose}
                disabled={convert.isPending}
                variant="outline"
                className="min-h-11 flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-medium transition hover:bg-secondary"
              >
                {ru ? "Отмена" : "Cancel"}
              </Button>
              <Button
                onClick={() => convert.mutate()}
                disabled={convert.isPending || !rule}
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

            <Button
              onClick={onResultClose ?? onClose}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-3 text-sm font-bold text-gold-foreground transition active:scale-[0.99]"
            >
              {ru ? "Отлично" : "Done"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
