// Под забранным объектом открылся беглец — показываем его сразу.
//
// Клетка рисуется одним объектом: сверху её собственный, под ним спрятавшийся
// беглец (server runners.ts). Забрали верхний — открыться должен нижний, и на
// сервере так и происходит. А у игрока карта живёт в кэше пять минут, и до
// этой правки клетка после «забрал артефакт» просто гасла: гриб под ним
// исчезал с глаз вместе с укрытием, хотя оставался жив и ждал второго захода.
//
// Сервер теперь говорит, КТО открылся (runner-reveal), — и в ответе на свой
// подбор, и живым потоком для соседей. Здесь эта справка ложится на карту.
import type { QueryClient } from "@tanstack/react-query";
import { applyCellPatches, readCellDetails, type MapLike } from "./patchMapCache";
import { parseCellKey } from "./applyFled";

/** Кто открылся: клетка «q,r» и его объект. */
export type Reveal = { cell: string; objectId: string };

const MAP_KEY = ["beta-raid-map"];

/**
 * Подменить объект клетки на открывшегося беглеца.
 *
 * Возвращает true, если карта и правда поменялась: то же событие приходит и
 * своим ответом, и потоком, а применять его дважды незачем.
 */
export function applyReveal(qc: QueryClient, reveal: Reveal | null | undefined): boolean {
  if (!reveal?.objectId) return false;
  const at = parseCellKey(reveal.cell);
  if (!at) return false;
  const map = qc.getQueryData(MAP_KEY) as MapLike;
  if (!map) return false;
  const cur = readCellDetails(map, at.q, at.r);
  // Уже открыт — второй раз не трогаем.
  if (cur.objectId === reveal.objectId && cur.runner) return false;
  qc.setQueryData(MAP_KEY, (old: MapLike) =>
    applyCellPatches(old, [
      { q: at.q, r: at.r, objectId: reveal.objectId, runner: true, alive: true },
    ]),
  );
  return true;
}
