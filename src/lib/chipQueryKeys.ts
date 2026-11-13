// Ключи фишек игрока и их перечит одним вызовом — рядом с heroQueryKeys.
//
// Жалоба владельца (13.11.2026): фишки из пака не появлялись в бою до
// перезагрузки. Пак открывался, а перечитывался только инвентарь обычных
// фишек. Пак острова новичка даёт ТРЕНИРОВОЧНЫЕ фишки — у них свой ключ
// (my-training-chips, staleTime 120 с, сутки в persist-кэше), и отряд-пикер
// в окне боя показывал прежний список, пока ключ сам не устареет.
import type { QueryClient } from "@tanstack/react-query";

/**
 * Где живут фишки, которые отряд-пикер (ChipSquadPicker) ставит в бой:
 *   my-chip-inventory — обычные фишки коллекций;
 *   my-training-chips — тренировочные (hallway_training_chips): пак острова,
 *                       стартовый отряд короткого обучения.
 */
export const CHIP_QUERY_KEYS = ["my-chip-inventory", "my-training-chips"] as const;

/**
 * Перечитать все списки фишек. Звать после ЛЮБОЙ выдачи фишек (открытие пака).
 *
 * refetchType "all" (по умолчанию): в момент открытия пака окна боя нет на
 * экране, а persist-кэш держит прежний ответ — обычная инвалидация пометила бы
 * его устаревшим, и окно боя сначала показало бы старый список. "active" —
 * для самого пикера: при входе в бой он освежает только то, что читает.
 */
export function invalidateChipQueries(
  qc: QueryClient,
  refetchType: "active" | "all" = "all",
): void {
  for (const key of CHIP_QUERY_KEYS) {
    void qc.invalidateQueries({ queryKey: [key], refetchType });
  }
}
