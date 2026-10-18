// Тренировочные фишки прихожи в отряд-пикере.
//
// Они лежат в отдельной таблице (hallway_training_chips), в инвентаре игры их
// нет вовсе — поэтому в списке фишек перед боем их не было видно, хотя сервер
// бета-рейда давно умеет с ними драться (encounter-lineup проверяет каждую по
// её id и берёт звезду из базы). Здесь они превращаются в такие же плитки, как
// обычные фишки: стек на звезду, экземпляры внутри.
//
// В бою они вдвое слабее обычных (boss.trialStatScale) — это считает сервер,
// клиенту достаточно показать их и дать поставить в строй.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { myTrainingChips } from "@/server/api/hallway";
import type { InvChip } from "./SquadInventoryGrid";

/** Отличаем тренировочный стек от обычного по шаблону: «train:5». */
export const TRAINING_PREFIX = "train:";
export const isTrainingTemplate = (templateId: string) => templateId.startsWith(TRAINING_PREFIX);

/** Что приходит с сервера про одну триал-фишку. */
export type TrainingChip = {
  id: string;
  star: number;
  serialNo?: number | null;
  imageUrl?: string | null;
};

/**
 * Сложить триал-фишки в стеки по звёздам — той же формы, что стеки инвентаря.
 *
 * Отдельной функцией, а не внутри хука: так её видно из проверок и из «Авто»,
 * и правило «id экземпляра = trainingId» лежит в одном месте.
 */
export function groupTrainingChips(list: TrainingChip[], label: string): InvChip[] {
  const byStar = new Map<number, InvChip>();
  for (const c of list) {
    const star = Number(c.star) || 1;
    const stack = byStar.get(star) ?? {
      templateId: `${TRAINING_PREFIX}${star}`,
      templateName: label,
      imageUrl: c.imageUrl ?? "",
      level: star,
      count: 0,
      chips: [],
    };
    stack.count += 1;
    // id экземпляра — это trainingId, который уйдёт на сервер: без него
    // триал-фишку нечем проверить, и в бой пошла бы фишка с чужой звездой.
    stack.chips!.push({ id: c.id, serialNo: c.serialNo ?? null });
    byStar.set(star, stack);
  }
  return [...byStar.values()].sort((a, b) => b.level - a.level);
}

/**
 * Тренировочные стеки для пикера и признак, что их список ещё не пришёл.
 *
 * `loading` нужен подрезке состава в ChipSquadPicker: она сверяет запомненный
 * отряд с тем, что есть в наличии, и если инвентарь отвечал раньше этого
 * запроса, триалы из состава вырезались как «отсутствующие» — новичок с одними
 * тренировочными собирал отряд заново перед каждым боем. Пока идёт запрос
 * (в том числе рефетч устаревшего persisted-кэша), состав трогать нельзя.
 */
export function useTrainingChips(
  enabled: boolean,
  label: string,
): { chips: InvChip[]; loading: boolean } {
  const q = useQuery({
    queryKey: ["my-training-chips"],
    queryFn: () => myTrainingChips(),
    staleTime: 120_000,
    enabled,
  });

  const chips = useMemo(
    () => (enabled ? groupTrainingChips(q.data ?? [], label) : []),
    [q.data, enabled, label],
  );
  // Только первая загрузка: рефетч (фокус окна, устаревший кэш) состав не держит —
  // свежие фишки и так попадут в зависимости подрезки через `chips`.
  return { chips, loading: enabled && q.isPending };
}

/**
 * Сила тренировочной фишки для автоподбора.
 *
 * В бою её статы режет сервер (boss.trialStatScale, обычно вдвое), поэтому по
 * номинальной звезде «Авто» ставил бы её впереди равной боевой фишки. Точное
 * значение множителя знает только сервер — здесь достаточно того, что триал
 * заведомо слабее: половина от квадрата уровня, тем же порядком, что и у
 * обычной фишки (сила ≈ HP × атака).
 */
export function trainingStrength(c: InvChip): number {
  return (c.level * c.level) / 2;
}
