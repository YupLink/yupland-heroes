// Перемещение в режиме бога: «Переместить» в окне клетки → тап по цели.
//
// Переносится здание (в блоке — весь блок), декор (в блоке — весь блок),
// объект клетки, сундук, мешочки клетки. Пока режим переноса включён, тап по
// карте выбирает ЦЕЛЬ (useAdminLive спрашивает здесь первым), тап по самой
// ведущей клетке — отмена. У блока ведущая — клетка, где стоит его постройка
// (или декор), где бы ни тапнули: вектор переноса — цель − ведущая.
//
// Перенос идёт мимо очереди кисти: это не слой клетки, а переезд со всем
// хозяйством (server god-move), и он применяется сразу. Поэтому клетки с
// невыгруженными правками не трогаем: выгрузка следом легла бы поверх переезда.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { keepsMoving, type GodCell, type GodMoveKind, type GodMoveResult } from "@/lib/godMove";
import { adminGodMove } from "@/server/api/beta-raid/god-move/move-api";
import type { CellPatch, MapLike } from "@/components/beta-raid/patchMapCache";
import { MAP_KEY } from "@/components/beta-raid/useMapProgressive";
import { applyGodMove } from "@/components/beta-raid/god-move/godMoveApply";
import { leadOf, unitCells, unitTargets } from "@/components/beta-raid/god-move/godMoveLead";

/**
 * Что переносим: ведущая клетка, вид, что видел админ (ref: постройка без
 * облика, декор, объект, «magic:/plain:» сундука, id мешочков через запятую),
 * имя для полоски и блок ли это (едет весь).
 */
export type GodMoveFrom = GodCell & {
  kind: GodMoveKind;
  ref: string;
  name: string;
  block?: boolean;
};

/** Выбор в окне клетки: что и под каким именем (клетку знает окно). */
export type GodMovePick = Pick<GodMoveFrom, "kind" | "ref" | "name">;

type Refusal = Extract<GodMoveResult, { ok: false }>;

const keyOf = (c: GodCell) => `${c.q},${c.r}`;

export function useGodMove(
  /** Режим бога включён и есть права. Выключили — перенос отменяется. */
  enabled: boolean,
  /** Очередь правок кисти: клетки с невыгруженным переносить нельзя. */
  queue: Record<string, CellPatch>,
) {
  const qc = useQueryClient();
  const t = useT();
  const [from, setFrom] = useState<GodMoveFrom | null>(null);

  useEffect(() => {
    if (!enabled) setFrom(null);
  }, [enabled]);

  const mapOf = () => qc.getQueryData(MAP_KEY) as MapLike;
  const drafted = (cells: GodCell[]) => cells.some((c) => !!queue[keyOf(c)]);

  // У тостов свой id: двойной тап по цели даёт два ответа (второй — «уже
  // там»), а надпись должна быть одна.
  const refused = (res: Refusal) => {
    const what = res.leftovers.map((k) => t(`godmove.lo.${k}`)).join(", ");
    toast.error(t(`godmove.${res.reason}`, { what }), { id: "godmove" });
  };

  const mut = useMutation({
    mutationFn: (v: { from: GodMoveFrom; to: GodCell }) =>
      adminGodMove({
        data: {
          kind: v.from.kind,
          from: { q: v.from.q, r: v.from.r },
          to: v.to,
          ref: v.from.ref,
          mapId: mapOf()?.map?.id,
        },
      }),
    onSuccess: (res, v) => {
      if (!res.ok) {
        refused(res);
        if (!keepsMoving(res.reason)) setFrom(null);
        return;
      }
      applyGodMove(qc, v.from, v.to, res);
      toast.success(t("godmove.done"), { id: "godmove" });
      setFrom(null);
    },
    // Сбой связи: режим не снимаем — повторный тап безопасен (сервер ответит
    // «уже там», если первый перенос всё же прошёл).
    onError: (e) => toast.error(humanError(e), { id: "godmove" }),
  });

  /** Взять на перенос. false — нельзя (невыгруженные правки): сказано тостом. */
  const start = (pick: GodMoveFrom): boolean => {
    if (!enabled) return false;
    const map = mapOf();
    const f = leadOf(map, pick);
    if (drafted(unitCells(map, f))) {
      toast.error(t("godmove.draft_pending"), { id: "godmove" });
      return false;
    }
    setFrom(f);
    return true;
  };

  /** Тап по карте в режиме переноса: цель, отмена (ведущая клетка) или ожидание. */
  const tap = (q: number, r: number) => {
    if (!from) return;
    if (from.q === q && from.r === r) {
      setFrom(null);
      return;
    }
    if (mut.isPending) return;
    if (drafted(unitTargets(mapOf(), from, { q, r }))) {
      toast.error(t("godmove.draft_pending"), { id: "godmove" });
      return;
    }
    mut.mutate({ from, to: { q, r } });
  };

  return { from, busy: mut.isPending, start, tap, cancel: () => setFrom(null) };
}

export type GodMove = ReturnType<typeof useGodMove>;
