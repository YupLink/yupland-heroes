// Кнопка «Показать» письма о потере шахты (владелец 04.11.2026, §8.106):
// игра открывается с ?mine=<строка журнала>. Шахта в мире героя — карта мира,
// камера на клетке, клетка мигает (герой не двигается). В другом мире, строки
// уже нет или потерь в письме несколько (?mine=list) — «Добыча», где строка
// с меткой мира. Параметр стираем из адреса: обновление его не повторит.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import { requestOpenHarvest } from "@/components/beta-raid/hud/harvestOpenBus";
import { HARVEST_KEY, fetchHarvest } from "@/components/beta-raid/hud/useHarvest";

let taken = false;

/** ?mine=… из адреса — один раз за загрузку страницы; адрес без него. */
export function takeMineParam(): string | null {
  if (taken || typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const v = url.searchParams.get("mine");
  if (!v) return null;
  taken = true;
  url.searchParams.delete("mine");
  try {
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* адрес не сменился — не беда, второй раз всё равно не сработает */
  }
  return v.slice(0, 200);
}

export function useMineLink(toWorld: () => void): void {
  const qc = useQueryClient();
  const go = useRef(toWorld);
  go.current = toWorld;
  useEffect(() => {
    const id = takeMineParam();
    if (!id) return;
    const openList = () => {
      go.current();
      requestOpenHarvest();
    };
    void qc
      .fetchQuery({ queryKey: HARVEST_KEY, queryFn: fetchHarvest, staleTime: 0 })
      .then((h) => {
        const n = id === "list" ? undefined : (h.notices ?? []).find((x) => x.id === id);
        if (n?.here) requestCenter({ q: n.q, r: n.r, ttlMs: 3000 });
        else openList();
      })
      .catch(openList);
  }, [qc]);
}
