import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { labelForLevel } from "@/components/chips/levelLabel";

export function ChipInventoryFilters({
  collections,
  levels,
  fCol,
  fLvl,
  fNum,
  anyFilter,
  setFCol,
  setFLvl,
  setFNum,
  onReset,
}: {
  collections: { id: string; name: string }[];
  levels: number[];
  fCol: string | null;
  fLvl: number | null;
  fNum: string;
  anyFilter: boolean;
  setFCol: (v: string | null) => void;
  setFLvl: (v: number | null) => void;
  setFNum: (v: string) => void;
  onReset: () => void;
}) {
  const t = useT();
  const selectCls =
    "min-w-0 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-[11px] font-medium outline-none focus:border-gold/50";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-secondary/10 p-2">
      {collections.length > 1 && (
        <select
          value={fCol ?? ""}
          onChange={(e) => setFCol(e.target.value || null)}
          className={cn(selectCls, "flex-1")}
        >
          <option value="">{t("chips.filter_all")}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <select
        value={fLvl ?? ""}
        onChange={(e) => setFLvl(e.target.value === "" ? null : Number(e.target.value))}
        className={selectCls}
      >
        <option value="">{t("chips.filter_all_stars")}</option>
        {levels.map((lv) => (
          <option key={lv} value={lv}>
            {labelForLevel(lv)}
          </option>
        ))}
      </select>
      <input
        value={fNum}
        onChange={(e) => setFNum(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder={t("chips.filter_num_ph")}
        className="w-16 shrink-0 rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px]"
      />
      {anyFilter && (
        <button
          type="button"
          className="shrink-0 rounded-full border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onReset}
          aria-label={t("chips.filter_reset")}
        >
          ✕
        </button>
      )}
    </div>
  );
}
