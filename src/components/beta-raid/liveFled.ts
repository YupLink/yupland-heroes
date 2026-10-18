// Событие «fled» живого потока: сосед спугнул объект, он переехал.
//
// Вынесено из useRaidLiveStream (файл и так за лимитом): здесь всё, что
// происходит на клиенте от чужого побега — правка карты, вспышка стрелки,
// разведка клеток побега и тост тому, кто стоял вплотную.
import type { QueryClient } from "@tanstack/react-query";
import { gameInfoToast } from "@/lib/gameInfoToast";
import { applyFled, parseCellKey, type FleeMove } from "./applyFled";
import { emitFlee } from "./fleeFlash";
import { revealFled } from "./fleeReveal";
import { hexDistance } from "./hexGeometry";
import { STATE_KEY } from "./stepCache";
import type { CellPatch } from "@/lib/raid/mapDelta";

/** Как «fled» приходит по проводу (server raidLive.RaidEvent). */
export type FledWire = {
  from?: unknown;
  to?: unknown;
  objectId?: string;
  via?: unknown;
  layer?: unknown;
  patches?: CellPatch[];
};

const key = (v: unknown): string | undefined =>
  typeof v === "string" && parseCellKey(v) ? v : undefined;

export function handleFled(qc: QueryClient, event: FledWire, t: (k: string) => string): void {
  const from = key(event.from);
  const to = key(event.to);
  if (!from || !to || !event.objectId) return;
  const move: FleeMove = { from, to, objectId: event.objectId };
  const via = key(event.via);
  if (via) move.via = via;
  if (event.layer === 0 || event.layer === 1) move.layer = event.layer;
  if (Array.isArray(event.patches) && event.patches.length) move.patches = event.patches;
  // Карту правим точечно и сразу; следом та же правда придёт дельтой «map»
  // (идемпотентно).
  const applied = applyFled(qc, [move]);
  // Пусто — переезд уже был учтён ответом собственного шага (useBetaMovement).
  // Игрок его видел, повторять нечего.
  if (applied.length === 0) return;
  // Мигнуть красной стрелкой «куда убежал» на 0.8с (fleeFlash → канвас).
  emitFlee(applied);
  const me = (qc.getQueryData(STATE_KEY) as { position?: { q: number; r: number } } | undefined)
    ?.position;
  // Видел, откуда убежал, — видит и куда (fleeReveal).
  revealFled(me, applied);
  // Говорим об этом только тем, кто стоял вплотную: сбежал он от них,
  // остальным на другом конце карты это шум. Тост информационный — его можно
  // выключить в настройках.
  const at = parseCellKey(from);
  if (me && at && hexDistance(me.q, me.r, at.q, at.r) <= 1) gameInfoToast(t("braid.target_fled"));
}
