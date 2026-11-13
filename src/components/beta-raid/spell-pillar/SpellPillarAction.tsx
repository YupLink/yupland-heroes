// Столб заклинаний в окне постройки: цены изучения и забвения и вход.
//
// Витрина живёт своим окном (SpellPillarModal): заклинаний бывает много, и в
// блок окна постройки они не влезают — так же устроены таверна и маркет.
import { useState } from "react";
import { Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { SpellbookExtra } from "@/lib/spellbookExtra";
import { pillarPriceLine } from "./spellPillarText";
import { SpellPillarModal } from "./SpellPillarModal";

export function SpellPillarAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: SpellbookExtra;
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const price = pillarPriceLine(extra.learnPrices, extra.forgetPrices, t);

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">{t("spellpillar.title")}</b>
      </div>

      {price && <p className="text-center text-[11px] text-muted-foreground">{price}</p>}

      {extra.reasonKey && (
        <p className="text-center text-[11px] text-destructive">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}

      <button
        type="button"
        data-spell-pillar-open
        onClick={() => setOpen(true)}
        disabled={!extra.can}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        <Wand2 className="h-4 w-4" />
        {t("spellpillar.open")}
      </button>

      {open && (
        <SpellPillarModal
          q={q}
          r={r}
          onClose={() => {
            setOpen(false);
            // Окно постройки перечитает себя: цена могла смениться, а книга —
            // пополниться, пока игрок стоял у столба.
            onDone();
          }}
        />
      )}
    </div>
  );
}

