// Одна награда промокода: вид → что именно (пикеры админки) → количество
// одним полем «1-10», вес и объём. Довыбор — отдельной строкой: на 393 px
// ему нужна вся ширина. Выпадает ОДНА строка кода по весам (владелец,
// 05.11.2026): у поля «Вес» — её шанс в процентах. «Ничего» — только вес.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { isPromoNothing, type PromoKind } from "@/lib/promo/promoTypes";
import { promoShareText } from "@/lib/promo/promoShares";
import { TourPrizeRefPicker } from "@/components/admin/tournaments/TourPrizeRefPicker";
import type { PrizeDraft } from "@/components/admin/tournaments/tourDraft";
import { PromoKindButton, PromoKindGrid } from "./PromoKindMenu";
import { PromoBossPick } from "./PromoBossPick";
import { lineErrors, lineOfKind, type LineDraft } from "./promoDraft";

const CAP = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base tabular-nums outline-none focus:border-gold/50";

/** Чем довыбирать: пикеры призов турнира (они же у наград и раздач). */
function RefPicker({ line, onPatch }: { line: LineDraft; onPatch: (p: Partial<LineDraft>) => void }) {
  const k = line.kind;
  if (k === "likes" || k === "energy" || k === "nothing") return null;
  if (k === "boss")
    return (
      <PromoBossPick
        value={line.ref}
        onPick={(b) => onPatch({ ref: b.id, title: b.name, image: b.image })}
      />
    );
  const prize: PrizeDraft = {
    kind: k,
    amount: line.amount,
    refId: line.ref,
    title: line.title,
    image: line.image,
  };
  return (
    <TourPrizeRefPicker
      ui={k}
      prize={prize}
      onPatch={(p) =>
        onPatch({
          ...(p.refId !== undefined ? { ref: p.refId } : {}),
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.image !== undefined ? { image: p.image } : {}),
        })
      }
    />
  );
}

export function PromoLineEditor({
  line,
  onChange,
  onRemove,
  canRemove,
  canToken,
  share = null,
}: {
  line: LineDraft;
  onChange: (next: LineDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  canToken: boolean;
  /** Шанс строки, % (вес / сумма весов); одна строка — null. */
  share?: number | null;
}) {
  const t = useT();
  const lang = useLang();
  const nothing = isPromoNothing(line.kind);
  const err = lineErrors(line);
  const patch = (p: Partial<LineDraft>) => onChange({ ...line, ...p });
  const touched = (s: string) => s.trim() !== "";
  const weight = (
    <label className="min-w-0">
      <span className={CAP}>
        {t("promo.adm.chance")}
        {share != null && ` · ${promoShareText(share, lang)}`}
      </span>
      <input
        value={line.chance}
        inputMode="decimal"
        placeholder="100"
        onChange={(e) => patch({ chance: e.target.value })}
        className={cn(FIELD, err.chance ? "border-destructive" : "border-border")}
      />
    </label>
  );
  const [kindOpen, setKindOpen] = useState(false);

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card/70 p-3" data-promo-line>
      <div className="flex items-center gap-2">
        <PromoKindButton value={line.kind} open={kindOpen} onToggle={() => setKindOpen((v) => !v)} />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("promo.adm.remove")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {kindOpen && (
        <PromoKindGrid
          canToken={canToken}
          value={line.kind}
          onPick={(k: PromoKind) => {
            if (k !== line.kind) onChange(lineOfKind(k, line));
            setKindOpen(false);
          }}
        />
      )}
      <RefPicker line={line} onPatch={patch} />
      {nothing ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">{weight}</div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label className="min-w-0">
            <span className={CAP}>{t("promo.adm.amount")}</span>
            <input
              value={line.amount}
              inputMode="text"
              placeholder="1-10"
              onChange={(e) => patch({ amount: e.target.value })}
              className={cn(FIELD, err.amount ? "border-destructive" : "border-border")}
            />
          </label>
          {weight}
          <label className="min-w-0">
            <span className={CAP}>{t("promo.adm.budget")}</span>
            <input
              value={line.budget}
              inputMode="numeric"
              placeholder="∞"
              onChange={(e) => patch({ budget: e.target.value })}
              className={cn(
                FIELD,
                // Токен без объёма подсвечен сразу: поле обязательно.
                err.budget && (touched(line.budget) || err.budget === "promo.err_token_budget")
                  ? "border-destructive"
                  : "border-border",
              )}
            />
          </label>
        </div>
      )}
      {!nothing && err.amount && touched(line.amount) && (
        <p className="text-xs text-destructive">{t(err.amount)}</p>
      )}
    </div>
  );
}
