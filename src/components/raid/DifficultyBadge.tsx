import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DIFF_META } from "./raid-screen-types";

export function DifficultyBadge({ difficulty }: { difficulty?: string | null }) {
  const t = useT();
  const d = difficulty ? DIFF_META[difficulty] : null;
  if (!d) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        d.cls
      )}
    >
      {t(d.key)}
    </span>
  );
}
