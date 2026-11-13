// Что перечитать после крафта или автоулучшения фишки.
//
// Раньше крафт звал refetchType: "all" на ВСЕ «my-chips-for-template»: перечитывались
// карточки каждого шаблона, который игрок когда-либо открывал, плюс инвентарь
// целиком (≈220 КБ). Игрок с 358 крафтами за час дал 2 192 запроса карточек (16.10).
// Теперь сразу перечитывается только то, что на экране, и карточка самого шаблона;
// остальное помечается устаревшим и перечитается, когда его откроют.
import type { QueryClient } from "@tanstack/react-query";

// my-resources — золото: улучшение платится им (с 20.10.2026, вместо билетов).
const ON_SCREEN = [
  "my-chip-inventory",
  "my-chip-history",
  "my-tickets",
  "my-resources",
  "chip-collection-detail",
];

export function invalidateAfterCraft(qc: QueryClient, templateId: string): void {
  void qc.invalidateQueries({
    queryKey: ["my-chips-for-template", templateId],
    refetchType: "all",
  });
  void qc.invalidateQueries({ queryKey: ["my-chips-for-template"], refetchType: "active" });
  for (const key of ON_SCREEN)
    void qc.invalidateQueries({ queryKey: [key], refetchType: "active" });
}
