// Настройка портала ЭТОЙ клетки: этаж и комната, уровень героя и цена прохода.
//
// Комната — номер сети на этаже (владелец, 07.10.2026: «комнаты m.1–m.n, где
// m — этаж»). По умолчанию предлагаются комнаты своего этажа; сменил этаж —
// список его комнат. Порталы одной комнаты связаны, на каком бы этаже ни
// стояли: вошёл в один — вышел в случайном другом. Ноль особенный: это дверь,
// она берёт плату и никуда не переносит.
//
// Комната помнит свои преднастройки (цена и границы уровня): выбрал её у
// нового портала — форма заполнилась. Переписать у конкретного портала можно,
// шаблон только подставляет.
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DoorOpen } from "lucide-react";
import { adminSavePortalRoom } from "@/server/api/beta-raid/portal-rooms";
import { applyGroupTemplate, PORTAL_DOOR, type PortalConfig } from "@/lib/portal";
import { roomLabel, roomNumbers } from "@/lib/portalFloors";
import { PortalFloorPicker } from "./PortalFloorPicker";
import { PortalLevelRange } from "./PortalLevelRange";
import { PortalMoveEnergyGate } from "./PortalMoveEnergyGate";
import { PortalPricesEditor } from "./PortalPricesEditor";
import { PortalRoomPicker } from "./PortalRoomPicker";
import { roomsKey, roomsQuery, usePortalPlaces, usePortalRooms } from "./usePortalPlaces";

/** Что комната запоминает у портала: цена и пороги. */
const template = (c: PortalConfig) => ({
  prices: c.prices.filter((p) => p.amount > 0),
  levelFromOn: c.levelFromOn,
  levelFrom: c.levelFrom,
  levelToOn: c.levelToOn,
  levelTo: c.levelTo,
  moveEnergyMinOn: c.moveEnergyMinOn,
  moveEnergyMin: c.moveEnergyMin,
});

export function PortalConfigEditor({
  config,
  tokens,
  mapId = null,
  onChange,
}: {
  config: PortalConfig;
  tokens: string[];
  /** Карта, на которой стоит портал; пусто — та, где стоит админ. */
  mapId?: string | null;
  onChange: (next: PortalConfig) => void;
}) {
  const qc = useQueryClient();
  const places = usePortalPlaces(mapId);
  const here = places.data?.here ?? mapId;
  // Этаж комнаты: назначенный у портала или свой.
  const floorMap = config.targetMap ?? here;
  const rooms = usePortalRooms(floorMap);
  const names = rooms.data?.names ?? {};
  const label = (g: number) =>
    floorMap ? roomLabel(places.data?.floors ?? [], floorMap, g) : String(g);

  // Сохраняя имя, сохраняем и то, что сейчас в форме: комната должна помнить
  // свою цену и уровни, иначе у каждого портала их пришлось бы набирать заново.
  const save = useMutation({
    mutationFn: (v: { map: string; group: number; name: string }) =>
      adminSavePortalRoom({
        data: { mapId: v.map, group: v.group, name: v.name, ...template(config) },
      }),
    onSuccess: (r, v) => qc.setQueryData(roomsKey(v.map), r),
  });

  const patch = (p: Partial<PortalConfig>) => onChange({ ...config, ...p });
  const isDoorNow = config.group === PORTAL_DOOR;

  // Сменили этаж — сразу его первая комната (нет ни одной — новая, номер 1):
  // портал не остаётся в комнате с номером, взятым с другого этажа.
  const pickFloor = async (f: string) => {
    try {
      const list = await qc.fetchQuery(roomsQuery(f));
      const first = roomNumbers(list)[0] ?? 1;
      onChange(
        applyGroupTemplate({ ...config, targetMap: f === here ? null : f }, first, list.names),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Комната запоминает свои настройки САМА, а не только в момент, когда ей
  // давали имя. Иначе выходило так: назвал, потом задал цену — и цена в шаблон
  // не попала, а новый портал этой комнаты открывался бесплатным.
  //
  // Пишем с задержкой: правка идёт посимвольно (номер, сумма), и слать запрос
  // на каждое нажатие незачем. Дверь шаблона не имеет — она у каждой клетки своя.
  const known = names[String(config.group)];
  const lastSaved = useRef("");
  useEffect(() => {
    if (isDoorNow || !known || !floorMap) return;
    const snapshot = JSON.stringify({ floorMap, group: config.group, ...template(config) });
    if (snapshot === lastSaved.current) return;
    const id = setTimeout(() => {
      lastSaved.current = snapshot;
      save.mutate({ map: floorMap, group: config.group, name: known.name });
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isDoorNow, known?.name, floorMap]);

  return (
    <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-violet-300">
        <DoorOpen className="h-3 w-3" />
        Портал ЭТОЙ клетки · применится, когда выгрузишь правки
      </p>

      {places.data && floorMap && (
        <PortalFloorPicker
          mapId={mapId}
          places={places.data}
          floorMap={floorMap}
          onPick={(f) => void pickFloor(f)}
        />
      )}

      <PortalRoomPicker
        group={config.group}
        names={names}
        nums={rooms.data ? roomNumbers(rooms.data) : []}
        own={floorMap === here}
        label={label}
        saving={save.isPending}
        onPick={(g) =>
          onChange(
            applyGroupTemplate(
              { ...config, targetMap: g === PORTAL_DOOR ? null : config.targetMap },
              g,
              names,
            ),
          )
        }
        onSave={(g, name) => floorMap && save.mutate({ map: floorMap, group: g, name })}
      />

      <p className="mb-2 text-[11px] text-muted-foreground">
        {isDoorNow
          ? "Дверь: берёт плату за проход и никуда не переносит."
          : `Комната ${label(config.group)} «${known?.name ?? "без названия"}»: выведет в случайный другой портал этой комнаты.`}
      </p>

      <PortalLevelRange
        fromOn={config.levelFromOn}
        from={config.levelFrom}
        toOn={config.levelToOn}
        to={config.levelTo}
        onChange={patch}
      />

      <PortalMoveEnergyGate
        on={config.moveEnergyMinOn}
        value={config.moveEnergyMin}
        onChange={patch}
      />

      <PortalPricesEditor
        prices={config.prices}
        tokens={tokens}
        onChange={(prices) => patch({ prices })}
      />
    </div>
  );
}
