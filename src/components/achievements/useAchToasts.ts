// Тост на новую редкость ачивки (§8.57): «Ачивка «Дровосек»: Обычная».
// Первый ответ — точка отсчёта: старые редкости тостами не сыплем.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { ACH_TRACK_IDS, rarityOf, stepOf, type AchCounts } from "@/lib/achievements/tracks";

export function useAchToasts(counts: AchCounts | undefined) {
  const t = useT();
  const seen = useRef<AchCounts | null>(null);
  useEffect(() => {
    if (!counts) return;
    const before = seen.current;
    seen.current = counts;
    if (!before) return;
    for (const id of ACH_TRACK_IDS) {
      const was = stepOf(id, before[id] ?? 0);
      const now = stepOf(id, counts[id] ?? 0);
      const r = rarityOf(now);
      if (now <= was || !r) continue;
      toast.success(
        t("ach.toast", {
          name: t(`ach.track.${id}`),
          rarity: t(`ach.rarity.${r}`),
        }),
      );
    }
  }, [counts, t]);
}
