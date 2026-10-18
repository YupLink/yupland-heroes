// Форма нового мира: название, сид (число или фраза), вид — карта в рамке или
// бесконечный, рамка карты, доля суши и земли мира. Всё выбором из списков,
// кроме имени и сида; подписей-пояснений нет — названия полей и значения.
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { WorldTerrain } from "@/server/api/beta-raid/worldgen/api";
import { LAND_CHOICES, type WorldDraft } from "./worldDraft";
import { WorldTerrainPicker } from "./WorldTerrainPicker";

const SIZES: ReadonlyArray<128 | 256> = [128, 256];

const CAP = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const FIELD =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-gold/50";
const chip = (on: boolean) =>
  cn(
    "rounded-lg border px-3 py-2 text-sm font-medium transition",
    on
      ? "border-gold/50 bg-gold/15 text-gold"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  );

export function WorldCreateForm({
  value,
  terrains = [],
  onChange,
  onCreate,
  busy,
}: {
  value: WorldDraft;
  /** Земли живой карты для выбора; пусто — блока нет. */
  terrains?: WorldTerrain[];
  onChange: (next: WorldDraft) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const t = useT();
  const patch = (p: Partial<WorldDraft>) => onChange({ ...value, ...p });
  const ready = value.name.trim().length > 0 && !busy;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0">
          <span className={CAP}>{t("worldgen.name")}</span>
          <input
            value={value.name}
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className="min-w-0">
          <span className={CAP}>{t("worldgen.seed")}</span>
          <input
            value={value.seedText}
            maxLength={80}
            onChange={(e) => patch({ seedText: e.target.value })}
            placeholder="🎲"
            className={FIELD}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["map", "endless"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => patch({ kind: k })}
            className={chip(value.kind === k)}
          >
            {t(k === "map" ? "worldgen.kind_map" : "worldgen.kind_endless")}
          </button>
        ))}
        {value.kind === "map" &&
          SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => patch({ size: s })}
              className={chip(value.size === s)}
            >
              {s} × {s}
            </button>
          ))}
      </div>

      <div>
        <span className={CAP}>{t("worldgen.land")}</span>
        <div className="flex flex-wrap gap-2">
          {LAND_CHOICES.map((l) => (
            <button
              key={String(l)}
              type="button"
              onClick={() => patch({ landPct: l })}
              className={chip(value.landPct === l)}
            >
              {l === null ? t("worldgen.land_live") : `${l} %`}
            </button>
          ))}
        </div>
      </div>

      {terrains.length > 0 && (
        <div>
          <span className={CAP}>{t("worldgen.terrain")}</span>
          <WorldTerrainPicker
            terrains={terrains}
            value={value.lands}
            onChange={(lands) => patch({ lands })}
          />
        </div>
      )}

      <button
        type="button"
        disabled={!ready}
        onClick={onCreate}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg gradient-gold px-4 text-sm font-semibold text-gold-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {t(busy ? "worldgen.creating" : "worldgen.create")}
      </button>
    </div>
  );
}
