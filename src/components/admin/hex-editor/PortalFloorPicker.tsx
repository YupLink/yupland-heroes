// Этаж комнаты портала: свой (по умолчанию), другой из списка или новый.
//
// Владелец, 07.10.2026: «базово для выбора даются комнаты этого этажа, но можно
// сменить этаж — открывающийся список (мир и пошло списком) — и можно создать
// ещё один этаж, подставив туда мир». Новый этаж — готовая карта из редактора
// или генератора миров; он сразу открыт для переходов.
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { floorLabel, type FloorPlaces } from "@/lib/portalFloors";
import { useFloorEdits } from "./usePortalPlaces";

const FIELD = "min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5";
const ICON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground disabled:opacity-40";
const BTN =
  "inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground disabled:opacity-40";

export function PortalFloorPicker({
  mapId,
  places,
  floorMap,
  onPick,
}: {
  /** Карта портала (ключ списка); пусто — где стоит админ. */
  mapId: string | null;
  places: FloorPlaces;
  /** Этаж комнаты, выбранной у портала сейчас. */
  floorMap: string;
  onPick: (mapId: string) => void;
}) {
  const edits = useFloorEdits(mapId, places.here);
  const [mode, setMode] = useState<"pick" | "new" | "rename">("pick");
  const [name, setName] = useState("");
  const [world, setWorld] = useState("");
  const current = places.floors.find((f) => f.mapId === floorMap) ?? null;
  const busy = edits.create.isPending || edits.rename.isPending || edits.drop.isPending;
  const fail = (e: Error) => toast.error(e.message);

  // Карта портала и выбранный этаж могут не быть этажами (черновик в редакторе,
  // снятый этаж) — им тоже нужна строка, иначе выбранное «пропало» бы.
  const extra = [places.here, floorMap].filter(
    (id, i, all) => all.indexOf(id) === i && !places.floors.some((f) => f.mapId === id),
  );
  const nameOf = (id: string) => places.free.find((m) => m.id === id)?.name ?? id;

  const create = () =>
    edits.create.mutate(
      { mapId: world, name: name.trim() },
      {
        onSuccess: () => {
          setMode("pick");
          onPick(world);
        },
        onError: fail,
      },
    );
  const rename = () =>
    current &&
    edits.rename.mutate(
      { mapId: current.mapId, name: name.trim() },
      { onSuccess: () => setMode("pick"), onError: fail },
    );
  const drop = () => {
    if (!current) return;
    if (!window.confirm(`Снять этаж «${current.name}»? Карта останется черновиком.`)) return;
    edits.drop.mutate({ mapId: current.mapId }, { onError: fail });
  };

  return (
    <div className="mb-2">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Этаж
      </span>
      <div className="flex items-center gap-1.5">
        <select
          value={floorMap}
          onChange={(e) => {
            if (e.target.value !== "new") {
              setMode("pick");
              return onPick(e.target.value);
            }
            setName("");
            setWorld("");
            setMode("new");
          }}
          className={`${FIELD} text-sm`}
        >
          {places.floors.map((f) => (
            <option key={f.mapId} value={f.mapId}>
              {floorLabel(f)}
              {f.mapId === places.here ? " · здесь" : ""}
            </option>
          ))}
          {extra.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)} · {id === places.here ? "эта карта" : "закрыт"}
            </option>
          ))}
          <option value="new">+ Новый этаж</option>
        </select>
        {current && (
          <button
            type="button"
            aria-label="Переименовать этаж"
            onClick={() => {
              setName(current.name);
              setMode(mode === "rename" ? "pick" : "rename");
            }}
            className={ICON}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {current && current.num !== 1 && (
          <button
            type="button"
            aria-label="Снять этаж"
            onClick={drop}
            disabled={busy}
            className={ICON}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {mode !== "pick" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Название этажа"
            className={`${FIELD} text-xs`}
          />
          {mode === "new" && (
            <select
              value={world}
              onChange={(e) => setWorld(e.target.value)}
              className={`${FIELD} text-xs`}
            >
              <option value="">Мир…</option>
              {places.free.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={mode === "new" ? create : rename}
            disabled={busy || !name.trim() || (mode === "new" && !world)}
            className={BTN}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {mode === "new" ? "Создать" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}
