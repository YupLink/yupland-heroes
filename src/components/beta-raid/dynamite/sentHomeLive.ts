// Личное событие потока «sentHome» (§8.75а, владелец 26.10.2026): синий динамит взорвал
// корабль, на котором стоял игрок, и сервер отнёс его в основной город (dynamite-crew-home).
// Перенёс чужой бросок — свой клиент об этом не знает: всё, что знало прежнюю клетку и
// этаж (позиция, карта, соседи, корабли), перечитываем — как после портала, без F5.
// Сюда же попадает окно «корабль подорвали» (ключ beta-raid-ship-blast, ShipBlastNotice).
import type { QueryClient } from "@tanstack/react-query";

/** true — событие было личным «sentHome» и обработано. */
export function handleSentHome(qc: QueryClient, event: { type?: string }): boolean {
  if (event.type !== "sentHome") return false;
  void qc.invalidateQueries({
    predicate: (q) => String(q.queryKey[0] ?? "").startsWith("beta-raid"),
  });
  return true;
}
