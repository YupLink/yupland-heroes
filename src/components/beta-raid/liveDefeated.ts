// «defeated» из живого потока: погасить добитое и показать беглеца, открывшегося
// под добитым верхним (server runner-reveal). Вынесено из useRaidLiveStream
// (там уже за 250 строк).
//
// Слой берём из события: `runner` — погас сам беглец, иначе объект клетки.
// Своё «defeated» убивший тоже получает потоком, и приходит оно то раньше
// ответа удара, то позже — без слоя оно гасило уже открытого зайца.
import type { QueryClient } from "@tanstack/react-query";
import { applyDefeated } from "./applyFled";
import { applyReveal, type Reveal } from "./applyReveal";

export type DefeatedWire = { cells?: unknown; runner?: unknown; reveal?: Reveal | null };

export function handleDefeated(qc: QueryClient, event: DefeatedWire): void {
  // Клетку гасим и здесь, не дожидаясь дельты «map»; и беглеца, открывшегося
  // под добитым, показываем сразу — иначе наблюдатели видели его лишь с
  // дельтой, а без неё — через минуту.
  applyDefeated(qc, Array.isArray(event.cells) ? event.cells : [], event.runner === true);
  applyReveal(qc, event.reveal);
}
