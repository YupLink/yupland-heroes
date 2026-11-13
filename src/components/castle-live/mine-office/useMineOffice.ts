// «Управление шахтами»: список своих шахт, удалённые режим и починка, сбор.
//
// После режима и починки — то же, что после них в окне шахты на карте
// (useMineInvalidate: ресурсы, «Добыча», флажки, окно шахты), плюс этот
// список и полосы службы; после сбора — то же, что после сбора в «Добыче»
// (refreshAfterCollect), плюс список и ачивки. Отказ (шахту уже отбили) тоже
// перечитывает список: отнятая из окна исчезает. Ключ повтора починки живёт
// до успеха, как у починки на карте.
import { useCallback, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { MINE_OFFICE_KEY } from "@/lib/mineOfficeBus";
import { minesCreditedLine } from "@/lib/minesCreditedLine";
import {
  getMineOfficeMines,
  type MineOfficeView,
  type OfficeMine,
} from "@/server/api/mine-office/mine-office-list";
import { officeRepairMine, officeSetMineMode } from "@/server/api/mine-office/mine-office-act";
import { officeClaimAllMines, officeClaimMine } from "@/server/api/mine-office/mine-office-claim";
import { getMineRepairAllQuote, repairAllMines } from "@/server/api/mine-office/mine-office-repair-all";
import type { RepairAllCell } from "@/server/api/mine-office/repair-all-plan";
import { MINE_LIFE_KEY } from "@/components/beta-raid/mine-life/mineLifeStore";
import { useMineInvalidate } from "@/components/beta-raid/mine/useMineInvalidate";
import { modeToastText, type MineModeSwitch } from "@/components/beta-raid/mine/useMineV2Actions";
import { refreshAfterCollect } from "@/components/beta-raid/hud/useHarvest";
import { ACH_KEY } from "@/components/achievements/useMyAchievements";

export const MINE_OFFICE_MINES_KEY = [...MINE_OFFICE_KEY, "mines"] as const;

/** Ответ + наша метка получения: срок шахт — по часам сервера (lib/mineV2Clock). */
async function fetchOffice(): Promise<MineOfficeView & { clientAt: number }> {
  const sent = Date.now();
  const res = await getMineOfficeMines();
  return { ...res, clientAt: Math.round((sent + Date.now()) / 2) };
}

/**
 * Окно открыли — свежий список. Отнятую шахту снимает живое «шахту отняли»
 * (useHarvest.handleMineLost) и «built» по своей шахте (useRaidLiveStream);
 * живой поток открыт, пока смонтирована карта, — без него, пока окно открыто,
 * список перечитывается раз в 20 с.
 */
export function useOfficeMines() {
  return useQuery({
    queryKey: MINE_OFFICE_MINES_KEY,
    queryFn: fetchOffice,
    staleTime: 0,
    retry: 1,
    refetchInterval: 20_000,
  });
}

/**
 * Обещание — до свежего списка: починка и режим ждут его, кнопка крутится,
 * пока полоса не покажет новый запас. Иначе секунду видна старая полоса при
 * тосте «запас 100 %» — и тянет нажать ещё раз (и заплатить дважды).
 */
function useOfficeRefresh(q: number, r: number): () => Promise<void> {
  const qc = useQueryClient();
  const mine = useMineInvalidate(q, r);
  return useCallback(() => {
    mine();
    void qc.invalidateQueries({ queryKey: MINE_LIFE_KEY });
    return qc.invalidateQueries({ queryKey: MINE_OFFICE_KEY });
  }, [qc, mine]);
}

/** Отказ: тост и свежий список (шахту могли отбить, пока окно открыто). */
function useOfficeFail(): (e: Error) => void {
  const qc = useQueryClient();
  return useCallback(
    (e: Error) => {
      toast.error(humanError(e));
      void qc.invalidateQueries({ queryKey: MINE_OFFICE_KEY });
    },
    [qc],
  );
}

export function useOfficeSetMode(m: OfficeMine) {
  const t = useT();
  const refresh = useOfficeRefresh(m.q, m.r);
  const fail = useOfficeFail();
  return useMutation({
    mutationFn: ({ mode }: MineModeSwitch) =>
      officeSetMineMode({ data: { mapId: m.mapId, q: m.q, r: m.r, mode } }),
    onSuccess: async (_res, vars) => {
      await refresh();
      toast.success(modeToastText(t, vars));
    },
    onError: fail,
  });
}

export function useOfficeRepair(m: OfficeMine) {
  const t = useT();
  const refresh = useOfficeRefresh(m.q, m.r);
  const fail = useOfficeFail();
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return officeRepairMine({
        data: { mapId: m.mapId, q: m.q, r: m.r, mode: m.view.mode, opId: op.current },
      });
    },
    onSuccess: async () => {
      op.current = null;
      await refresh();
      toast.success(t("mine2.repaired_toast"));
    },
    onError: fail,
  });
}

/** После сбора — как в «Добыче», плюс окно шахты, этот список и ачивки. */
function useCollectRefresh(): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    refreshAfterCollect(qc);
    void qc.invalidateQueries({ queryKey: MINE_OFFICE_KEY });
    void qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
    void qc.invalidateQueries({ queryKey: ACH_KEY });
  }, [qc]);
}

export function useOfficeClaim(m: OfficeMine) {
  const t = useT();
  const refresh = useCollectRefresh();
  const fail = useOfficeFail();
  return useMutation({
    mutationFn: () => officeClaimMine({ data: { mapId: m.mapId, q: m.q, r: m.r } }),
    onSuccess: (res) => {
      toast.success(
        res.amount > 0
          ? t("mine.collected_toast", { n: res.amount, res: t(`mine.res.${m.kind}`) })
          : t("mine.nothing_yet"),
      );
      refresh();
    },
    onError: fail,
  });
}

/** «Собрать всё» — со всех шахт окна; тост — как у «Собрать со всех шахт». */
export function useOfficeClaimAll() {
  const t = useT();
  const refresh = useCollectRefresh();
  const fail = useOfficeFail();
  return useMutation({
    mutationFn: () => officeClaimAllMines(),
    onSuccess: (res) => {
      const line = minesCreditedLine(t, res.credited);
      toast.success(line ? t("mine.collected_all_toast", { line }) : t("mine.nothing_yet"), {
        position: "top-center",
      });
      refresh();
    },
    onError: fail,
  });
}

/**
 * Цена «Починить всё» по порогу ползунка (доля 0..1); без порога — по
 * выбранному в прошлый раз (он на аккаунте). Свежая при каждом открытии;
 * пока считается новая, видна прежняя (без мигания).
 */
export function useOfficeRepairAllQuote(below: number | undefined) {
  return useQuery({
    queryKey: [...MINE_OFFICE_KEY, "repair-all", below ?? "saved"],
    queryFn: () => getMineRepairAllQuote({ data: below === undefined ? {} : { below } }),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

/**
 * «Починить всё»: клетки — ровно из показанной цены (по ним сервер узнаёт
 * повтор и второй раз не списывает). После — как после починки одной шахты.
 */
export function useOfficeRepairAll(onDone: () => void) {
  const qc = useQueryClient();
  const refresh = useOfficeRefresh(0, 0);
  const fail = useOfficeFail();
  const ru = useLang() !== "en";
  return useMutation({
    mutationFn: (v: { cells: RepairAllCell[]; below: number }) => repairAllMines({ data: v }),
    onSuccess: async (res) => {
      void qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
      await refresh();
      onDone();
      const n = res.repaired.length;
      if (n > 0) toast.success(ru ? `Починено шахт: ${n}` : `Mines repaired: ${n}`);
      else toast(ru ? "Чинить нечего" : "Nothing to repair");
    },
    onError: fail,
  });
}
