// Персональный свод «сколько чего добываю в час» — по видам ресурса.
//
// Собирает шахты и поля в одну Map<name → sum>. Сортирует по убыванию.
// Ноль-добычу скрываем: пустая шахта в списке — шум.
//
// Игроки просили именно этот вид: «для каждого игрока — сколько идёт добычи
// ресурса и какого в час; если не добывается — не отображать».
import { useT } from "@/lib/i18n";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import type { HarvestField } from "@/server/api/beta-raid/harvest-fields";

const KNOWN = new Set(["likes", "tickets", "energy", "gold", "stone", "diamonds", "wood", "custom"]);

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

export function HarvestByKind({
  mines,
  fields,
}: {
  mines: MineRow[];
  fields: HarvestField[];
}) {
  const t = useT();
  const label = (key: string) => (KNOWN.has(key) ? t(`mine.res.${key}`) : key);

  // Собираем per-вид: шахта отдаёт resource | token, поле — reward.resource или
  // reward.name (custom).
  const perKind = new Map<string, number>();
  for (const m of mines) {
    if (!(m.yield > 0)) continue;
    const name = m.resource === "token" ? (m.token ?? "token") : label(m.resource);
    perKind.set(name, (perKind.get(name) ?? 0) + Number(m.yield));
  }
  for (const f of fields) {
    if (!(f.perHour > 0)) continue;
    const name =
      f.reward.kind === "item"
        ? f.reward.name
        : f.reward.resource === "token"
          ? (f.reward.token ?? "token")
          : label(f.reward.resource);
    perKind.set(name, (perKind.get(name) ?? 0) + Number(f.perHour));
  }

  if (perKind.size === 0) return null;

  const rows = [...perKind.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("harvest.by_kind_title")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(([name, sum]) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300"
          >
            <span className="truncate max-w-[110px]">{name}</span>
            <span className="tabular-nums text-emerald-200">{fmt(sum)}/ч</span>
          </span>
        ))}
      </div>
    </div>
  );
}
