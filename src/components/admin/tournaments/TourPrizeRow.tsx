// Один приз строки мест: вид, сколько, и что именно (токен/ресурс/бокс/…).
// Довыбор — отдельной строкой под контролами: на 360 px ему нужна вся ширина.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TourPrizeKindButton, TourPrizeKindGrid } from "./TourPrizeKindMenu";
import { TourPrizeRefPicker } from "./TourPrizeRefPicker";
import { isPieceKind, prizeOfUiKind, uiKindOf, type PrizeDraft } from "./tourDraft";

export function TourPrizeRow({
  prize,
  onChange,
  onRemove,
}: {
  prize: PrizeDraft;
  onChange: (next: PrizeDraft) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [kindOpen, setKindOpen] = useState(false);
  const ui = uiKindOf(prize);
  const piece = isPieceKind(prize.kind);
  const bad = prize.amount.trim() !== "" && !(Number(prize.amount.replace(",", ".")) > 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <TourPrizeKindButton value={ui} open={kindOpen} onToggle={() => setKindOpen((v) => !v)} />
        <input
          type="text"
          inputMode={piece ? "numeric" : "decimal"}
          value={prize.amount}
          onChange={(e) => onChange({ ...prize, amount: e.target.value })}
          placeholder={t("tour.adm.amount")}
          className={
            "h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus:border-gold/50 " +
            (bad ? "border-destructive" : "border-border")
          }
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("tour.adm.remove")}
          className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {kindOpen && (
        <TourPrizeKindGrid
          value={ui}
          onPick={(k) => {
            if (k !== ui) onChange(prizeOfUiKind(k, prize.amount));
            setKindOpen(false);
          }}
        />
      )}
      <TourPrizeRefPicker ui={ui} prize={prize} onPatch={(p) => onChange({ ...prize, ...p })} />
    </div>
  );
}
