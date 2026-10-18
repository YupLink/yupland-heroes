// Два объектных слоя клетки глазами админа: её собственный объект и беглец.
//
// Вынесено из useAdminCellView (правило ≤250 строк). Смысл разделения тот же,
// что и на сервере (runners.ts): в самой клетке лежит один объект, а беглец
// пришёл на неё сам и живёт в своей таблице. Поэтому у них разные кнопки —
// объект уходит в очередь правок клетки, беглец убирается сразу.
import type { CellObjectConfig } from "@/server/api/beta-raid/admin-live-read";
import { parseAdminObject, type AdminObjectRef } from "./adminObjectId";
import type { CellPatch } from "./patchMapCache";

export type AdminCellObject = {
  id: string;
  name: string;
  alive: boolean;
  config: CellObjectConfig | null;
  /** Разобранный id: с чем открывать полную форму. null — разобрать нельзя. */
  editor: AdminObjectRef | null;
};

export type AdminCellRunner = { id: string; name: string; alive: boolean };

/** Ответ сервера про клетку — ровно те поля, что нужны обоим слоям. */
type ServerCell = {
  object?: { id: string; name: string; config: CellObjectConfig | null } | null;
  runner?: { id: string; name: string } | null;
};

export function composeCellObjects(opts: {
  /** Объект САМОЙ клетки; null — его нет (или показан беглец). */
  cellObjectId: string | null;
  /** Беглец, стоящий на клетке; null — его нет. */
  runnerId: string | null;
  /** Показанный объект уже добыт (по живому списку своего слоя). */
  defeated: boolean;
  /** Объект только что положен кистью — отметки о смерти у него нет. */
  fresh: boolean;
  /** Ответ сервера про эту же клетку — если он ещё про тот же объект. */
  srv: ServerCell | undefined;
  sameObject: boolean;
  /** Невыгруженная правка клетки: она главнее и живого списка. */
  queued: CellPatch | undefined;
  /** Имя объекта по id: карта, палитра, а в крайнем случае сам id. */
  nameOf: (id: string) => string;
  /** Словарь объектов карты — по нему разбирается вид для полной формы. */
  objects: Record<string, { kind?: string | null; meta?: unknown }> | undefined;
}): { object: AdminCellObject | null; runner: AdminCellRunner | null } {
  const { cellObjectId, runnerId, defeated, fresh, srv, sameObject, queued, nameOf } = opts;

  return {
    runner: runnerId
      ? {
          id: runnerId,
          name: srv?.runner?.id === runnerId ? srv.runner.name : nameOf(runnerId),
          alive: !defeated,
        }
      : null,
    object: cellObjectId
      ? {
          id: cellObjectId,
          name: sameObject ? (srv?.object?.name ?? nameOf(cellObjectId)) : nameOf(cellObjectId),
          // Свежепоставленный объект жив: старой отметки о смерти у него нет.
          // Невыгруженное «погасить/оживить» главнее и живого списка.
          alive: queued?.alive !== undefined ? queued.alive : fresh || !defeated,
          config:
            queued?.objectConfig !== undefined
              ? ((queued.objectConfig as CellObjectConfig | null) ?? null)
              : sameObject
                ? (srv?.object?.config ?? null)
                : null,
          editor: parseAdminObject(cellObjectId, opts.objects?.[cellObjectId]),
        }
      : null,
  };
}
