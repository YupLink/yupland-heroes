import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { myChipInventory } from "@/server/api/chips-pack";
import { ArrowRight } from "lucide-react";

type InvItem = Awaited<ReturnType<typeof myChipInventory>>[number];

function fmtTickets(x: number): string {
  const n = Number(x) || 0;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function fmtFarm(x: number): string {
  const n = Number(x) || 0;
  if (n <= 0) return "0";
  const r2 = Math.round(n * 100) / 100;
  if (r2 >= 0.01) return String(r2);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtBurnedPct(p: number): string {
  const n = Number(p) || 0;
  if (n <= 0) return "0%";
  if (n >= 1) return `${Math.round(n)}%`;
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function levelKey(lvl: number): string {
  return Number.isInteger(lvl) ? String(lvl) : lvl.toFixed(1);
}

function Badge({
  label,
  filled,
  total,
  rate,
}: {
  label: string;
  filled: number;
  total: number;
  rate: number;
}) {
  const t = useT();
  const done = filled >= total && total > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        done
          ? "border-success/40 bg-success/10 text-success"
          : "border-border bg-secondary/40 text-muted-foreground",
      )}
      title={t("chips.badge_title", { rate, label })}
    >
      <span className="font-bold">{label}</span>
      <span className="opacity-70">
        {filled}/{total}
      </span>
    </span>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/40 py-1 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function CraftHeader({
  template,
  chipLevel,
  baseSerialNo,
}: {
  template: { imageUrl: string };
  chipLevel: number;
  baseSerialNo: number | null;
}) {
  return (
    <div className="mb-3 flex items-center justify-center gap-2">
      <div className="w-28 overflow-hidden rounded-2xl border border-border bg-card">
        <ChipImage src={template.imageUrl} level={chipLevel} alt="" className="w-full" />
        <div className="p-1 text-center text-[10px] text-muted-foreground">
          {labelForLevel(chipLevel)}
          <span className="ml-1 font-mono text-gold">#{baseSerialNo ?? "?"}</span>
        </div>
      </div>
      <ArrowRight className="h-6 w-6 text-gold" />
      <div className="w-28 overflow-hidden rounded-2xl border border-gold/50 bg-gold/5 shadow-gold">
        <ChipImage src={template.imageUrl} level={chipLevel + 0.5} alt="" className="w-full" />
        <div className="p-1 text-center text-[10px] font-bold text-gold">
          {labelForLevel(chipLevel + 0.5)}
          <span className="ml-1 font-mono">#{baseSerialNo ?? "?"}</span>
        </div>
      </div>
    </div>
  );
}

function CandidatesGrid({
  candidates,
  selectedIds,
  onToggle,
}: {
  candidates: Array<{ id: string; item: InvItem; serialNo: number | null }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const t = useT();
  if (candidates.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("chips.can_burn")}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {candidates.map((c) => {
          const checked = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              className={cn(
                "relative overflow-hidden rounded-lg border transition",
                checked
                  ? "border-rose-400/70 ring-2 ring-rose-400/40"
                  : "border-border hover:border-gold/40",
              )}
            >
              <ChipImage
                src={c.item.imageUrl}
                level={c.item.level}
                alt={c.item.templateName}
                className="w-full"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/65 py-px text-center font-mono text-[8px] leading-tight text-white">
                #{c.serialNo ?? "?"}
              </span>
              {checked && (
                <div className="absolute inset-0 flex items-center justify-center bg-rose-400/20">
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    🔥
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { InvItem };
export { fmtTickets, fmtFarm, fmtBurnedPct, levelKey, Badge, KV, CraftHeader, CandidatesGrid };

/**
 * Чем карточка коллекции забирает билеты. Задаёт вызывающий: музей на карте
 * шлёт свою ручку (с клеткой и надбавкой за тир), раздел «Фишки» не шлёт
 * ничего — оттуда сбор убран.
 */
export type ClaimFarmFn = (collectionId: string) => Promise<{
  claimedTickets: number;
  totalClaimed: number;
  minLevel: number;
  ratePerDay: number;
  bonusPct?: number;
}>;
