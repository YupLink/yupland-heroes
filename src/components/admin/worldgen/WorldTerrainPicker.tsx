// Из каких земель собрать мир (владелец, 07.10.2026: «нужно давать возможность
// выбирать, из какого типа местности будет состоять карта»). Земли — те, что
// генератор знает по живой карте (у них есть свой декор и свои боссы); у
// каждой — картинка и доля на живой карте. «Все» — как живая карта.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import type { WorldTerrain } from "@/server/api/beta-raid/worldgen/api";

const tile = (on: boolean) =>
  cn(
    "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition",
    on
      ? "border-gold/50 bg-gold/15 text-foreground"
      : "border-border bg-background text-muted-foreground opacity-60 hover:opacity-100",
  );

export function WorldTerrainPicker({
  terrains,
  value,
  onChange,
}: {
  terrains: WorldTerrain[];
  /** Отмеченные земли; null — все. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const t = useT();
  const on = (id: string) => value === null || value.includes(id);
  const toggle = (id: string) => {
    const now = value ?? terrains.map((x) => x.id);
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    // Мир без земли не соберётся: последнюю не снимаем.
    if (next.length === 0) return;
    onChange(next.length === terrains.length ? null : next);
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(tile(value === null), "justify-center font-semibold")}
      >
        {t("worldgen.terrain_all")}
      </button>
      {terrains.map((x) => (
        <button key={x.id} type="button" onClick={() => toggle(x.id)} className={tile(on(x.id))}>
          {x.image ? (
            <img
              src={thumb(x.image, 64)}
              alt=""
              loading="lazy"
              className="h-7 w-7 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="h-7 w-7 shrink-0 rounded bg-secondary" />
          )}
          <span className="min-w-0 flex-1 truncate">{x.name}</span>
          <span className="shrink-0 tabular-nums">{x.share}%</span>
        </button>
      ))}
    </div>
  );
}
