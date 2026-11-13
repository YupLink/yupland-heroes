// Куда ведёт каждый портал открытых этажей — одним правилом для карт игрока
// (world-portals-net) и сверки порталов (portal-check).
//
// Правило — как у прохода (portal-exits): комната = номер сети на этаже
// targetMap (пусто — на своём), выход — другой портал комнаты на открытом
// этаже, номер сети сверяется строкой. Дверь (сеть 0, в том числе портал без
// настройки) — шлагбаум на месте, не переход.
import { isDoor, portalConfig } from "@/lib/portal";

export type PortalRow = {
  map_id: string;
  q: number;
  r: number;
  portal: unknown;
  grp: string | null;
  room_map: string;
};

/**
 * door — дверь; closed — этаж комнаты закрыт; alone — в комнате нет второго
 * портала; inner — выходы только в этом же мире; cross — межмировой.
 */
export type PortalKind = "door" | "closed" | "alone" | "inner" | "cross";

export type PortalVerdict = {
  kind: PortalKind;
  /** Карты выходов, кроме своей (для cross — хотя бы одна). */
  to: string[];
  /** Сеть выводит и в свой мир. */
  alsoHere: boolean;
};

/** Вердикт по каждой строке rows (порядок тот же). live — id открытых карт. */
export function classifyPortals(
  rows: readonly PortalRow[],
  live: ReadonlySet<string>,
): PortalVerdict[] {
  const byRoom = new Map<string, PortalRow[]>();
  for (const x of rows) {
    const key = `${x.room_map}|${x.grp ?? ""}`;
    const list = byRoom.get(key);
    if (list) list.push(x);
    else byRoom.set(key, [x]);
  }
  return rows.map((e): PortalVerdict => {
    const cfg = portalConfig({ portal: e.portal });
    if (isDoor(cfg)) return { kind: "door", to: [], alsoHere: false };
    const room = { mapId: cfg.targetMap ?? e.map_id, group: cfg.group };
    if (room.mapId !== e.map_id && !live.has(room.mapId)) {
      return { kind: "closed", to: [], alsoHere: false };
    }
    const maps = new Set<string>();
    for (const x of byRoom.get(`${room.mapId}|${Math.round(room.group)}`) ?? []) {
      if (x.map_id === e.map_id && x.q === e.q && x.r === e.r) continue;
      maps.add(x.map_id);
    }
    const to = [...maps].filter((m) => m !== e.map_id).sort();
    const alsoHere = maps.has(e.map_id);
    if (to.length > 0) return { kind: "cross", to, alsoHere };
    return { kind: alsoHere ? "inner" : "alone", to: [], alsoHere };
  });
}
