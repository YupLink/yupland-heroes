// Список шагов обучения для окна — порядок и состояния от сервера (25.10.2026,
// пробный выпуск обучения: «согласованный порядок шагов по реальным действиям
// игрока»). Окно рисует шаги ровно в этом порядке и своего не держит: шаг «по
// факту» засчитывает сервер, когда игрок это сделал (в любом порядке),
// «Понятно» — ackIsland; текущий — первый незасчитанный из доступных. Пропуск
// обучения (skipped) — текущего нет, подсказки молчат, засчитанное остаётся.
import { SHORT_STEP_IDS } from "./shortTutorial";
import type { Cell } from "@/lib/raid/worldgen/geo";
import {
  ISLAND_STEP_IDS,
  currentStep,
  isAckStep,
  stepAvailable,
  stepChapter,
  stepTarget,
  type IslandChapter,
  type IslandPlaces,
  type IslandStepId,
} from "./steps";

export type IslandStepView = {
  id: IslandStepId;
  chapter: IslandChapter;
  /** «ack» — засчитывает кнопка «Понятно»; «fact» — сервер по сделанному. */
  kind: "ack" | "fact";
  done: boolean;
  skipped?: boolean;
  /** Шаг есть на этом острове (артефакт и «найди пак» — только у старых). */
  available: boolean;
  current: boolean;
  /** Клетка цели — для «Показать»; null — шаг не про клетку. */
  target: Cell | null;
};

export function islandStepList(
  done: ReadonlySet<string>,
  places: IslandPlaces,
  skipped = false,
  order: readonly IslandStepId[] = ISLAND_STEP_IDS,
): IslandStepView[] {
  const cur = skipped ? null : currentStep(done, places, order);
  return order.map((id) => ({
    id,
    chapter: stepChapter(id, order),
    kind: isAckStep(id) ? "ack" : "fact",
    done: done.has(id) || (order === SHORT_STEP_IDS && done.has(`skip:${id}`)),
    skipped: order === SHORT_STEP_IDS && done.has(`skip:${id}`),
    available: stepAvailable(id, places),
    current: id === cur,
    target: stepTarget(id, places),
  }));
}
