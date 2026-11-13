// Окно постройки «Генератор артефактов» (§8.122): слова («Какой артефакт?»,
// пусто — случайный), редкость с её ценой, «Создать»; ниже — мои заказы.
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { CRAFT_RARITIES, type CraftRarity } from "@/lib/craft/craftTable";
import { WORDS_MAX } from "@/lib/craft/craftWords";
import type { ArtGenExtra } from "@/lib/artGen/artGenConfig";
import { stepPrice } from "@/lib/artGen/artGenStep";
import { useLabLabels } from "@/components/admin/lab/labLabels";
import { priceText } from "@/components/beta-raid/portalPriceText";
import { GenJobCard } from "./GenJobCard";
import { useArtGen } from "./useArtGen";

export function ArtGenAction({ q, r, extra }: { q: number; r: number; extra: ArtGenExtra }) {
  const t = useT();
  const L = useLabLabels();
  const { state, order, unique } = useArtGen(q, r);
  const sold = CRAFT_RARITIES.filter((x) => extra.prices[x].length > 0);
  const [rarity, setRarity] = useState<CraftRarity | null>(null);
  const [words, setWords] = useState("");
  const pick = rarity && sold.includes(rarity) ? rarity : (sold[0] ?? null);
  // Цена растёт с каждым заказом подряд (artGenStep); пятый подряд — последний до resetAt.
  const step = state.data?.step;
  const price = pick ? stepPrice(extra.prices[pick], step ?? 1) : [];
  const resetAt = state.data?.resetAt;
  const jobs = state.data?.jobs ?? [];
  // Генераций на сегодня на всех (владелец 08.11: «снизу писать осталось 45 из 50»);
  // с fal.ai предела нет (11.11) — null, строки нет.
  const left = state.data?.left;
  const max = state.data?.max;

  return (
    <section className="space-y-3">
      {!extra.can && extra.reasonKey && (
        <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
          {serverErrorText(new Error(extra.reasonKey), t)}
        </p>
      )}
      {extra.can && pick && (
        <>
          <textarea
            value={words}
            onChange={(e) => setWords(e.target.value)}
            maxLength={WORDS_MAX}
            rows={2}
            placeholder={t("lab.words")}
            className="w-full resize-none rounded-xl bg-card px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-gold/40"
          />
          <div className="flex gap-1 rounded-xl bg-card p-1">
            {sold.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setRarity(x)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg px-0.5 py-2 text-xs transition sm:text-sm",
                  x === pick
                    ? "bg-gold/15 text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {L.meta(x)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={order.isPending || left === 0 || step === null}
            onClick={() => order.mutate({ rarity: pick, words, step: step ?? 1 })}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold px-3 py-2 text-sm font-semibold text-gold-foreground disabled:opacity-60"
          >
            {order.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t("artgen.create", { price: priceText(price, t) })}
          </button>
        </>
      )}
      {left != null && max != null && (
        <p className="text-center text-xs text-muted-foreground">
          {t("artgen.left", { n: left, max })}
        </p>
      )}
      {step === null && resetAt != null && (
        <p className="text-center text-xs text-muted-foreground">
          {t("artgen.next_at", {
            time: new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          })}
        </p>
      )}
      {jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map((j) => (
            <GenJobCard
              key={j.id}
              job={j}
              uniquePrice={j.q === q && j.r === r ? extra.unique : []}
              busy={unique.isPending && unique.variables === j.id}
              onUnique={() => unique.mutate(j.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
