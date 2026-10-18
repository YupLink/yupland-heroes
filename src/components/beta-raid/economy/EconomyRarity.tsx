// Бейдж редкости для товаров (арты, паки, герои). Общие цвета для всей
// сводки Экономики: иначе легендарки в списке и в карточке начнут окрашиваться
// по-разному. Живёт отдельно от вкладки, чтобы клиентские правила стиля
// хранились в одном месте.
import { cn } from "@/lib/utils";

const CLASS: Record<string, string> = {
  common: "border-slate-500/50 text-slate-300 bg-slate-500/10",
  rare: "border-sky-400/50 text-sky-300 bg-sky-500/10",
  epic: "border-fuchsia-400/50 text-fuchsia-300 bg-fuchsia-500/10",
  legendary: "border-amber-400/60 text-amber-300 bg-amber-500/10",
};

const LABEL_RU: Record<string, string> = {
  common: "обычн.",
  rare: "редк.",
  epic: "эпич.",
  legendary: "легенд.",
};

export function RarityBadge({
  rarity,
  className,
}: {
  rarity: string | null | undefined;
  className?: string;
}) {
  if (!rarity) return null;
  const cls = CLASS[rarity] ?? "border-border text-muted-foreground bg-secondary/40";
  const label = LABEL_RU[rarity] ?? rarity;
  return (
    <span
      className={cn(
        "rounded border px-1 text-[10px] font-semibold uppercase tracking-wider",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
