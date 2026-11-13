// Починка, смена режима, улучшение и разборка шахты v2 (ПРАВИЛА §8.59, §8.74, §8.70) — запросы и
// обновление окна.
//
// Ключ повтора починки живёт до успеха: двойной тап и повтор после обрыва
// связи несут тот же opId, и сервер второй раз ничего не спишет. Отказ базы
// откатывает всё целиком (ключ не записан), так что повтор с ним же честен.
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { dismantleToastText } from "@/lib/mineDismantleGot";
import { newOpId } from "@/lib/opId";
import { mineMode, type MineMode } from "@/lib/mineV2";
import { mineLeftParts } from "@/lib/mineV2Clock";
import { repairMine, setMineMode } from "@/server/api/beta-raid/mine-v2";
import { upgradeMine } from "@/server/api/beta-raid/mine-upgrade";
import { dismantleMine } from "@/server/api/beta-raid/mine-dismantle/mine-dismantle";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { MINE_LIFE_KEY } from "@/components/beta-raid/mine-life/mineLifeStore";
import { useMineInvalidate } from "./useMineInvalidate";

export function useMineRepair(q: number, r: number, onDone?: () => void) {
  const t = useT();
  const invalidate = useMineInvalidate(q, r);
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: (mode: MineMode) => {
      op.current ??= newOpId();
      return repairMine({ data: { q, r, mode, opId: op.current } });
    },
    onSuccess: (res) => {
      op.current = null;
      toast.success(t(res.captured ? "mine2.taken_toast" : "mine2.repaired_toast"));
      invalidate();
      onDone?.();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}

/** Улучшить свою (§8.74): ключ повтора — как у починки; полоса и кружок уровня — сразу. */
export function useMineUpgrade(q: number, r: number) {
  const t = useT();
  const invalidate = useMineInvalidate(q, r);
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return upgradeMine({ data: { q, r, opId: op.current } });
    },
    onSuccess: (res) => {
      op.current = null;
      toast.success(t("mine2.up_toast", { n: res.level }));
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}

/**
 * Разобрать сломанную (§8.70): ключ повтора — как у починки. Шахты больше нет —
 * окно закрывается (onDone); ресурсы возврата уже на счёте — тост «Получено: …»,
 * полоса ресурсов и счёт (useMineInvalidate), мешочек товаров и полоса службы — сразу.
 */
export function useMineDismantle(q: number, r: number, onDone?: () => void) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const invalidate = useMineInvalidate(q, r);
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return dismantleMine({ data: { q, r, opId: op.current } });
    },
    onSuccess: (res) => {
      op.current = null;
      toast.success(dismantleToastText(t, lang, res));
      invalidate();
      invalidateBags(qc);
      void qc.invalidateQueries({ queryKey: MINE_LIFE_KEY });
      onDone?.();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}

/** Смена режима: leftMs — сколько до поломки в новом режиме (для тоста). */
export type MineModeSwitch = { mode: MineMode; leftMs?: number };

type T = (key: string, params?: Record<string, string | number>) => string;

/** Тост смены режима: «Усердно ×2 — сломается через 1 д 12 ч». */
export function modeToastText(t: T, { mode, leftMs }: MineModeSwitch): string {
  const name = `${t(`mine2.mode.${mode}`)} ×${mineMode(mode).mult}`;
  if (leftMs == null) return t("mine2.mode_toast", { mode: name });
  const left = mineLeftParts(leftMs);
  return t("mine2.mode_toast_left", { mode: name, left: t(left.key, left.params) });
}

/** mapId — карта шахты из «Добычи» (другой этаж); нет — где стоит игрок. */
export function useMineSetMode(q: number, r: number, onDone?: () => void, mapId?: string) {
  const t = useT();
  const invalidate = useMineInvalidate(q, r);
  return useMutation({
    mutationFn: ({ mode }: MineModeSwitch) =>
      setMineMode({ data: mapId ? { q, r, mode, mapId } : { q, r, mode } }),
    onSuccess: (_res, vars) => {
      toast.success(modeToastText(t, vars));
      invalidate();
      onDone?.();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}
