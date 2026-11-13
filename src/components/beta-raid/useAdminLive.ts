// Состояние режима бога: включён ли, чем красим и какая клетка открыта.
//
// Держится отдельно от экрана рейда, чтобы тот остался оркестратором (§13.6).
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { useAdminBrush } from "./useAdminBrush";
import { useAdminMerge } from "./useAdminMerge";
import { useGodMove } from "@/components/beta-raid/god-move/useGodMove";
import { useSpawnStamp } from "@/components/beta-raid/spawn-point/useSpawnStamp";
import { blockInspectCell } from "./mergeSelect";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { useCreatorAutosave } from "./creator/useCreatorAutosave";
import { useCreatorCanEdit } from "./creator/useCreator";
import type { EraseTarget } from "./eraseTarget";
import type { MapLike } from "./patchMapCache";

/**
 * Что делает тап по клетке: открыть её, покрасить, стереть, набрать в блок или
 * поставить точку спавна выбранным шаблоном (spawn-point/useSpawnStamp).
 */
export type AdminMode = "inspect" | "paint" | "erase" | "merge" | "spawn";

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
  /** Карта, где стоит игрок: на острове новичка режим бога есть и у дизайнера замка. */
  mapId?: string | null;
}) {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const isAdmin = session.data?.isAdmin === true;
  const island = isIslandMapId(opts?.mapId ?? "");
  // Право island_god (04.11.2026) — режим бога целиком, как у админа, но только
  // на своём острове и без денег (сервер: requireGodAdmin, god-money).
  // Право creator (07.11.2026) — то же в работах креатора (isle_cw_…): сервер
  // пускает только в свою или открытую ему работу (creator-access).
  const islandGod =
    !isAdmin &&
    ((island && session.data?.islandGod === true) ||
      (isCreatorMapId(opts?.mapId) && session.data?.creator === true));
  const admin = isAdmin || islandGod;
  // Дизайнер (Ангелина, 31.10.2026) — только на острове и только кисть по
  // местности, дорогам, декору и постройкам: шаблоны городов (TownTemplatePanel).
  // Право god_map (04.11.2026) — то же, но на любой карте, где стоит.
  const designer =
    !admin &&
    ((island && session.data?.isCastleEditor === true) || session.data?.canGodMap === true);
  const enabled = admin || designer;
  const [on, setOn] = useState(false);
  // Мир креатора (владелец, 07.11.2026: «передвижений нет вообще — режим бога
  // изначально и полностью; ходьба с героем — кнопкой вкл/выкл»): вошёл —
  // режим бога включён (если мир можно править), «Ходьба» его выключает.
  const creatorMap = isCreatorMapId(opts?.mapId);
  const [walk, setWalk] = useState(false);
  const canEdit = useCreatorCanEdit(creatorMap && enabled ? opts?.mapId : null, isAdmin);
  useEffect(() => {
    if (creatorMap && enabled) setOn(!walk && canEdit);
  }, [creatorMap, enabled, walk, canEdit]);
  // Ушла с острова — режим бога гаснет сам: тумблера там нет, а открытая карта осталась бы.
  useEffect(() => {
    if (!enabled) setOn(false);
  }, [enabled]);
  const [mode, setMode] = useState<AdminMode>("inspect");
  // Что снимает ластик (eraseTarget.ts); «местность» — только в мире креатора.
  const [eraseTarget, setEraseTarget] = useState<EraseTarget>("top");
  const erasing: EraseTarget = eraseTarget === "terrain" && !creatorMap ? "top" : eraseTarget;
  // В мире креатора сразу кисть с палитрой — «Правка» клетки там нужна реже.
  useEffect(() => {
    if (creatorMap) setMode("paint");
  }, [creatorMap]);
  const [cell, setCell] = useState<{ q: number; r: number } | null>(null);
  const brush = useAdminBrush(enabled, { onGenToggle: opts?.onGenToggle });
  // Мир креатора: правки кисти уезжают на сервер сами, без «Выгрузить».
  useCreatorAutosave(enabled ? opts?.mapId : null, brush);
  const merge = useAdminMerge(enabled, brush.queueCell);
  // Перенос (здание, блок, декор, объект, сундук, мешочки): живёт, пока
  // включён режим бога (выключили — отменён).
  const move = useGodMove(admin && on, brush.queue);
  const stamp = useSpawnStamp();
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
    // В мире креатора без «Ходьбы» тап героя не двигает (и при просмотре чужого мира).
    if (!enabled || !on) return creatorMap && !walk;
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
    if (mode === "spawn" && stamp.template) {
      stamp.tap(q, r);
      return true;
    }
    if (mode === "erase") {
      if (!brush.erase(q, r, erasing)) {
        toast(erasing === "top" ? t.eraseEmpty : t.eraseNothing, { id: "admin-erase-empty" });
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
      stamp.setTemplate(null);
      setMode("paint");
    }
  };

  /** Смена режима сбрасывает набор объединения и перенос: чужой режим их не видит. */
  const switchMode = (next: AdminMode) => {
    if (next !== "merge") merge.clear();
    if (next !== "spawn") stamp.setTemplate(null);
    move.cancel();
    setMode(next);
  };

  /** Шаблон точки спавна: выбран — тапы ставят точки, сброшен — обычная правка. */
  const pickStamp = (id: string | null) => {
    stamp.setTemplate(id);
    merge.clear();
    move.cancel();
    setMode(id ? "spawn" : "inspect");
  };

  return {
    designer,
    islandGod,
    /** Мир креатора: студия вместо значка «Правка карты» (creator/CreatorStudio). */
    creatorMap,
    mapId: opts?.mapId ?? null,
    walk,
    setWalk,
    /** Мир можно править (автор, «править» или админ); иначе — только смотреть. */
    canEdit,
    eraseTarget: erasing,
    setEraseTarget,
    /** Деньги (раздача, восстановление) — только админу. */
    money: isAdmin,
    /** Общие справочники («Создать объект», «+ новый») — админ или право catalogs. */
    catalogs: isAdmin || session.data?.canCatalogs === true,
    island,
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
    stamp,
    pickStamp,
    handleTap,
  };
}
