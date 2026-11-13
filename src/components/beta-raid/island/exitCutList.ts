// Строка «что осталось на острове» для тоста выхода порталом (§8.114).
import { EXIT_RES, type ResAmounts } from "@/lib/raid/island/exitCap";

type T = (key: string, vars?: Record<string, string | number>) => string;

export function exitCutList(cut: ResAmounts, t: T): string {
  return EXIT_RES.filter((r) => (cut[r] ?? 0) > 0)
    .map((r) => t(`island.cut_${r}`, { n: Math.round((cut[r] ?? 0) * 100) / 100 }))
    .join(" · ");
}
