// Режим «Объединить» в режиме бога: набор клеток → блок; тап по блоку — выбор
// (масштаб «−/+», «Разъединить»). Правки идут в ту же очередь, что и кисть
// (queueCell): на карте видны сразу, на сервер уезжают кнопкой «Выгрузить».
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { MERGE_MAX_CELLS, MERGE_MIN_CELLS, stepIconScale } from "@/lib/mergeScale";
import type { CellPatch } from "@/lib/raid/mapDelta";
import { readCellDetails, type MapLike } from "./patchMapCache";
import {
  isConnectedAxial,
  keyOf,
  membersOfGroup,
  newGroupId,
  parseKey,
  scaleOfGroup,
} from "./mergeSelect";
import { mergeText } from "./adminMergeText";
import type { MergeSelection } from "./drawMergeOverlay";

const MAP_KEY = ["beta-raid-map"];

export function useAdminMerge(enabled: boolean, queueCell: (patch: CellPatch) => void) {
  const qc = useQueryClient();
  const t = mergeText(useLang());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(null);
  /** Кэш карты меняется вне React — после своих правок дёргаем пересчёт полоски. */
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((v) => v + 1), []);

  const mapOf = useCallback((): MapLike => qc.getQueryData(MAP_KEY) as MapLike, [qc]);

  /** Тап: клетка блока — выбрать блок (повторно — снять выбор); иначе тумблер. */
  const tap = useCallback(
    (q: number, r: number) => {
      if (!enabled) return;
      const d = readCellDetails(mapOf(), q, r);
      if (d.groupId) {
        setActive((cur) => (cur === d.groupId ? null : d.groupId));
        return;
      }
      setActive(null);
      setSelected((prev) => {
        const next = new Set(prev);
        const key = keyOf(q, r);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [enabled, mapOf],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    setActive(null);
  }, []);

  /** Объединить набранное. Проверки — как в замке, плюс «одна постройка на блок». */
  const merge = useCallback((): boolean => {
    const keys = [...selected];
    const fail = (msg: string) => {
      toast.error(msg, { id: "admin-merge" });
      return false;
    };
    if (keys.length < MERGE_MIN_CELLS) return fail(t.tooFew);
    if (keys.length > MERGE_MAX_CELLS) return fail(t.tooMany);
    if (!isConnectedAxial(keys)) return fail(t.notAdjacent);
    const map = mapOf();
    let buildings = 0;
    let decors = 0;
    for (const key of keys) {
      const [q, r] = parseKey(key);
      const d = readCellDetails(map, q, r);
      if (!d.terrainId) return fail(t.noGround);
      if (d.groupId) return fail(t.alreadyGrouped);
      if (d.buildingId) buildings += 1;
      if (d.decorationId) decors += 1;
    }
    if (buildings > 1) return fail(t.manyBuildings);
    // Декор блока — тоже одна картинка на весь блок: второй был бы спрятан.
    if (decors > 1) return fail(t.manyDecors);
    const gid = newGroupId();
    for (const key of keys) {
      const [q, r] = parseKey(key);
      queueCell({ q, r, groupId: gid, iconScale: 1 });
    }
    setSelected(new Set());
    setActive(gid);
    bump();
    toast.success(t.merged, { id: "admin-merge" });
    return true;
  }, [selected, mapOf, queueCell, t, bump]);

  /** Масштаб выбранного блока на шаг — всем его клеткам разом. */
  const scale = useCallback(
    (dir: 1 | -1) => {
      const map = mapOf();
      if (!active || !map?.packed) return;
      const next = stepIconScale(scaleOfGroup(map.packed, active), dir);
      for (const key of membersOfGroup(map.packed, active)) {
        const [q, r] = parseKey(key);
        queueCell({ q, r, iconScale: next });
      }
      bump();
    },
    [active, mapOf, queueCell, bump],
  );

  /** Разъединить выбранный блок: все клетки выходят из него, масштаб уходит. */
  const unmerge = useCallback(() => {
    const map = mapOf();
    if (!active || !map?.packed) return;
    for (const key of membersOfGroup(map.packed, active)) {
      const [q, r] = parseKey(key);
      queueCell({ q, r, groupId: null, iconScale: null });
    }
    setActive(null);
    bump();
  }, [active, mapOf, queueCell, bump]);

  /**
   * Что показать в полоске: выбранный блок (размер, масштаб) или ничего.
   * Считаем на КАЖДЫЙ рендер (блоков единицы, тройки короткие): кэш карты
   * живёт вне React — «Забыть правки» или чужая дельта убирают блок без нашего
   * ведома, и полоска не должна показывать исчезнувшее.
   */
  const packed = mapOf()?.packed;
  const members = active && packed ? membersOfGroup(packed, active).length : 0;
  const block =
    active && packed && members > 0
      ? { cells: members, scale: scaleOfGroup(packed, active) }
      : null;
  useEffect(() => {
    if (active && members === 0) setActive(null);
  }, [active, members, tick]);

  const sel: MergeSelection = useMemo(() => ({ selected, active }), [selected, active]);

  return { selected, active, sel, block, tap, merge, scale, unmerge, clear };
}
