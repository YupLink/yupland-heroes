// Одно заклинание на витрине столба: картинка, что даёт, чего стоит герою и
// кнопка «Выучить» (или «Забыть», если столб умеет забывать).
//
// Цена ИЗУЧЕНИЯ у столба одна на все заклинания (её показывает шапка окна), а
// здесь — цена КАСТА: энергия и откат уже с учётом интеллекта героя.
import { BookMinus, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { PillarSpell } from "@/server/api/beta-raid/spell-pillar";
import { cooldownText, giftText } from "./spellPillarText";

export function SpellPillarCard({
  spell,
  canForget,
  busy,
  onLearn,
  onForget,
}: {
  spell: PillarSpell;
  /** Забвение показываем, только если админ задал за него цену. */
  canForget: boolean;
  busy: boolean;
  onLearn: () => void;
  onForget: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const gift = giftText(spell, lang, t);

  return (
    <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-start gap-3">
        {spell.image ? (
          <img
            src={thumb(spell.image, 120)}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary/60">
            <Wand2 className="h-5 w-5 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {/* Имя лежит в базе по-русски — переводим тем же словарём, что
                имена построек и боссов: незнакомое остаётся как есть. */}
            <b className="min-w-0 flex-1 truncate text-sm">{localizeAssetName(spell.name, lang)}</b>
            {spell.learned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold">
                <Check className="h-3 w-3" />
                {t("spellpillar.learned")}
              </span>
            )}
          </div>
          {spell.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{spell.description}</p>
          )}
          {gift && <p className="mt-0.5 text-[11px] text-gold">{gift}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("spellpillar.energy", { n: spell.energyCost })} ·{" "}
            {cooldownText(spell.cooldownMinutes, t)}
            {spell.minInt > 0 ? ` · ${t("spellpillar.req_int", { n: spell.minInt })}` : ""}
          </p>
        </div>
      </div>

      {/* Отказ пишем всегда, когда он есть: гаснущая кнопка без причины —
          это «не работает», а не «не хватает интеллекта». */}
      {!spell.learned && spell.reasonKey && (
        <p className="mt-1.5 text-center text-[11px] text-destructive">
          {t(spell.reasonKey, spell.reasonParams)}
        </p>
      )}

      <div className="mt-1.5 flex gap-1.5">
        {!spell.learned && (
          <button
            type="button"
            onClick={onLearn}
            disabled={busy || !spell.canLearn}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t("spellpillar.learn")}
          </button>
        )}
        {spell.learned && canForget && (
          <button
            type="button"
            onClick={onForget}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookMinus className="h-4 w-4" />
            )}
            {t("spellpillar.forget")}
          </button>
        )}
      </div>
    </div>
  );
}
