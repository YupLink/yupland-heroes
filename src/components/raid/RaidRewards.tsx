import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";

// Расклад «место → награда» переехал в отдельный модуль (правило ≤250 строк).
export { BossRewardPool } from "./BossRewardPool";

export function RewardByPlace({
  places,
}: {
  places?: Array<{
    place: number;
    fillers: Array<{ kind: string; amount: number }>;
    packs: Array<{ name: string; imageUrl: string | null }>;
  }>;
}) {
  const t = useT();
  const std = new Set(["likes", "tickets", "energy"]);
  if (!places || places.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1 rounded-lg border border-border/40 bg-secondary/20 p-2">
      {places.map((p) => (
        <div key={p.place} className="flex items-start gap-2 text-[11px]">
          <span
            className={cn(
              "w-14 shrink-0 font-bold",
              p.place === 1 ? "text-gold" : p.place <= 3 ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {t("raid.place_gets", { n: p.place })}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
            {p.fillers.filter((f) => f.amount > 0).length > 0 && (
              <span>
                {p.fillers
                  .filter((f) => f.amount > 0)
                  .map(
                    (f) =>
                      `${fillerIcon(f.kind)} ${f.amount.toLocaleString()}${std.has(f.kind) ? "" : " " + f.kind}`
                  )
                  .join(" · ")}
              </span>
            )}
            {p.packs.map((pk, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-gold">
                {pk.imageUrl ? (
                  <img src={thumb(pk.imageUrl, 32)} alt="" className="h-3.5 w-3.5 rounded object-cover" />
                ) : (
                  "🎴"
                )}
                {pk.name}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function fillerIcon(kind: string): string {
  switch (kind) {
    case "likes": return "❤️";
    case "tickets": return "🎟";
    case "energy": return "⚡";
    default: return "🪙";
  }
}
