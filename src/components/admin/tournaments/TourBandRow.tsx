// Строка мест: одно поле «Места» («1» или «2-3») и призы на КАЖДОЕ место
// строки. Призов сколько угодно — «+ Приз» добавляет ещё один (DARAI).
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { parsePlaces } from "@/lib/tournament/places";
import { TourPrizeRow } from "./TourPrizeRow";
import { prizeOfUiKind, type BandDraft, type PrizeDraft } from "./tourDraft";

export function TourBandRow({
  band,
  onChange,
  onRemove,
}: {
  band: BandDraft;
  onChange: (next: BandDraft) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const badPlaces = band.places.trim() !== "" && parsePlaces(band.places) === null;
  const setPrize = (i: number, p: PrizeDraft) =>
    onChange({ ...band, prizes: band.prizes.map((x, j) => (j === i ? p : x)) });

  return (
    <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-2.5">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("tour.adm.f_places")}
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={band.places}
          onChange={(e) => onChange({ ...band, places: e.target.value })}
          placeholder="1 / 2-3"
          className={
            "h-10 w-24 rounded-lg border bg-background px-3 text-base font-semibold outline-none focus:border-gold/50 " +
            (badPlaces ? "border-destructive" : "border-border")
          }
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("tour.adm.remove")}
          className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {band.prizes.map((p, i) => (
        <TourPrizeRow
          key={i}
          prize={p}
          onChange={(next) => setPrize(i, next)}
          onRemove={() => onChange({ ...band, prizes: band.prizes.filter((_, j) => j !== i) })}
        />
      ))}

      <button
        type="button"
        onClick={() => onChange({ ...band, prizes: [...band.prizes, prizeOfUiKind("darai")] })}
        className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-gold"
      >
        <Plus className="h-3.5 w-3.5" /> {t("tour.adm.add_prize")}
      </button>
    </div>
  );
}
