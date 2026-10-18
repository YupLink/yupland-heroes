// Состояние режима бога: включён ли, чем красим и какая клетка открыта.
//
// Держится отдельно от экрана рейда, чтобы тот остался оркестратором (§13.6).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { useAdminBrush } from "./useAdminBrush";
import { useAdminMerge } from "./useAdminMerge";
import { useGodMove } from "@/components/beta-raid/god-move/useGodMove";
import { blockInspectCell } from "./mergeSelect";
import type { MapLike } from "./patchMapCache";

/** Что делает тап по клетке: открыть её, покрасить, стереть или набрать в блок. */
export type AdminMode = "inspect" | "paint" | "erase" | "merge";

/**
 * Права спрашиваем здесь, а не аргументом сверху: экран рейда — общий файл, за
 * который держатся сразу несколько правок, и лишний проп из админской ветки там
 * только собирает конфликты. Сессия к этому моменту уже в кэше.
 *
 * Без прав режим бога мёртв целиком, а не только скрыт: экран открыт у всех
 * игроков, и платить подпиской на кэш и чтением черновика из localStorage за
 * чужую механику им незачем.
 */
export function useAdminLive(opts?: {
  /** Кисть биом-выделения кидает список клеток мазка — тумблер решает верх. */
  onGenToggle?: (cells: Array<{ q: number; r: number }>, center: { q: number; r: number }) => void;
}) {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const enabled = session.data?.isAdmin === true;
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<AdminMode>("inspect");
  const [cell, setCell] = useState<{ q: number; r: number } | null>(null);
  const brush = useAdminBrush(enabled, { onGenToggle: opts?.onGenToggle });
  const merge = useAdminMerge(enabled, brush.queueCell);
  // Перенос (здание, блок, декор, объект, сундук, мешочки): живёт, пока
  // включён режим бога (выключили — отменён).
  const move = useGodMove(enabled && on, brush.queue);
  const t = godText(useLang());

  /**
   * Тап по клетке в режиме правки. Режим выбирается явно: «правка» открывает
   * окно клетки (корабли, тиры, табличка), «кисть» красит выбранным, «ластик»
   * стирает. Возвращает false, если режим выключен: тогда тап играет как обычно.
   *
   * Тап, который ничего не сделал, обязан сказать почему: id у подсказки один
   * на режим — тапов бывает десять подряд, а надпись должна быть одна.
   */
  const handleTap = (q: number, r: number): boolean => {
    if (!enabled || !on) return false;
    // Взято на перенос — тап выбирает, куда поставить (по ведущей клетке —
    // отмена), какой бы режим ни стоял.
    if (move.from) {
      move.tap(q, r);
      return true;
    }
    if (mode === "merge") {
      merge.tap(q, r);
      return true;
    }
    if (mode === "erase") {
      if (!brush.erase(q, r)) {
        toast(t.eraseEmpty, { id: "admin-erase-empty" });
      }
      return true;
    }
    if (mode === "paint") {
      // Панель обещает «Тап ставит: …», а без выбранного ассета ставить нечего.
      // Открывать вместо этого окно клетки — подменять обещанное действие.
      // Кисть в руках, а мазка не вышло — значит под куполом или дорогой не
      // оказалось земли: раньше и в этом случае писалось «выбери, чем красить».
      if (!brush.paint(q, r)) {
        toast(brush.brush ? t.needGround : t.pickAssetFirst, { id: "admin-brush-empty" });
      }
      return true;
    }
    // Тап по картинке блока чаще попадает в соседку ведущей клетки: окно
    // открываем у постройки блока, как и в игре (blockInspectCell).
    setCell(blockInspectCell(qc.getQueryData(["beta-raid-map"]) as MapLike, q, r));
    return true;
  };

  /** Выбор ассета сам включает кисть — иначе он бы ничего не делал. */
  const pickBrush = (next: Parameters<typeof brush.setBrush>[0]) => {
    brush.setBrush(next);
    if (next) {
      merge.clear();
      move.cancel();
      setMode("paint");
    }
  };

  /** Смена режима сбрасывает набор объединения и перенос: чужой режим их не видит. */
  const switchMode = (next: AdminMode) => {
    if (next !== "merge") merge.clear();
    move.cancel();
    setMode(next);
  };

  return {
    on,
    setOn,
    mode,
    setMode: switchMode,
    cell,
    setCell,
    brush,
    merge,
    move,
    pickBrush,
    handleTap,
  };
}
