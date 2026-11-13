// Мир креатора сохраняется сам (владелец, 07.11.2026: «лучше чтобы он всегда
// сохранялся на сервере — чтобы не было зависимости, сохранил или не сохранил»;
// вечером: «при переходе не сохранились правки — творчество слетело»).
//
// Кисть режима бога копит правки черновиком до «Выгрузить» (useAdminBrush), а
// при смене карты чужой черновик выбрасывается (adminDraft.verifyDraft — это
// защита живого мира). Поэтому в мире креатора черновик уезжает на сервер:
//  · сам — через AUTOSAVE_MS после последнего мазка (таймер держится на ключе
//    очереди, а не на каждой перерисовке экрана — иначе частые перерисовки его
//    сбрасывали и он не срабатывал вовсе);
//  · сразу — когда игра уходит в фон (свернули, закрыли);
//  · ДО любого перехода (creator/useCreator.useCreatorMove → flushCreatorEdits):
//    не сохранилось — перехода нет.
// Ту же очередь второй раз сам не шлёт: клетки без земли сервер не берёт, и
// они остаются в очереди — без этой сверки выгрузка крутилась бы по кругу.
import { useEffect, useRef } from "react";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import type { CellPatch } from "../patchMapCache";
import type { PublishResult } from "../useAdminPublish";

export const AUTOSAVE_MS = 800;

type Brush = {
  queue: Record<string, CellPatch>;
  pending: number;
  sending: boolean;
  publish: (opts?: { quiet?: boolean }) => Promise<PublishResult>;
};

/** Сохранить мир креатора сейчас; null — сохранять нечего или мы не в мире креатора. */
let flushNow: (() => Promise<PublishResult | null>) | null = null;

/**
 * Перед переходом: несохранённое — на сервер. false — сохранить не вышло
 * (сбой связи, чужая карта): переходить нельзя, иначе черновик пропадёт.
 */
export async function flushCreatorEdits(): Promise<boolean> {
  const res = flushNow ? await flushNow() : null;
  return !res?.failed;
}

export function useCreatorAutosave(mapId: string | null | undefined, brush: Brush) {
  const on = isCreatorMapId(mapId);
  const latest = useRef(brush);
  latest.current = brush;
  const tried = useRef("");
  const sig = on && brush.pending > 0 ? JSON.stringify(brush.queue) : "";

  useEffect(() => {
    if (!on) return;
    const save = async (): Promise<PublishResult | null> => {
      const b = latest.current;
      if (b.pending === 0) return null;
      // Выгрузка уже едет — дождаться её: черновик, пока она в пути, не трогают.
      for (let i = 0; i < 50 && latest.current.sending; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      tried.current = JSON.stringify(latest.current.queue);
      return latest.current.publish({ quiet: true });
    };
    flushNow = save;
    const hide = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      if (flushNow === save) flushNow = null;
    };
  }, [on]);

  useEffect(() => {
    if (!sig || sig === tried.current) return;
    const id = setTimeout(() => {
      const b = latest.current;
      if (b.sending || b.pending === 0) return;
      tried.current = JSON.stringify(b.queue);
      void b.publish({ quiet: true });
    }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [sig]);
}
