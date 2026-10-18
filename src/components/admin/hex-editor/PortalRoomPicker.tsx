// Выбор комнаты портала на выбранном этаже: список известных плюс «новая».
//
// Комната подписана «этаж.номер» (2.3), потому что номера у каждого этажа
// свои. Номер сам по себе ничего не говорит, поэтому список показывает имена,
// а новая комната заводится тут же: номер подставляется следующим по порядку,
// а имя вводится и сохраняется — дальше эту комнату выбирают у других
// порталов, в том числе с других этажей.
//
// Вместе с именем запоминаются цена и границы уровня: у комнаты один смысл, и
// перенабирать их у каждого портала незачем. У конкретного портала их потом
// можно переписать.
import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { nextGroupNumber, PORTAL_DOOR, type PortalGroupNames } from "@/lib/portal";

export function PortalRoomPicker({
  group,
  names,
  nums,
  own,
  label,
  saving,
  onPick,
  onSave,
}: {
  group: number;
  names: PortalGroupNames;
  /** Номера комнат этажа: названные и те, где уже стоят порталы. */
  nums: number[];
  /** Этаж свой — можно выбрать дверь (она никуда не ведёт и этажа не имеет). */
  own: boolean;
  /** Подпись номера: «2.3». */
  label: (group: number) => string;
  saving: boolean;
  /** Выбрана существующая комната: подставляем её преднастройки. */
  onPick: (group: number) => void;
  /** Сохранить комнату под этим номером с этим именем (пустое имя — удалить). */
  onSave: (group: number, name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const known = Array.from(new Set([...(own ? [PORTAL_DOOR] : []), ...nums, group])).sort(
    (a, b) => a - b,
  );
  const text = (g: number) =>
    g === PORTAL_DOOR ? "Дверь" : `${label(g)} · ${names[String(g)]?.name ?? "без названия"}`;

  const startNew = () => {
    const next = nextGroupNumber(names, [...nums, group]);
    setDraftName("");
    setAdding(true);
    onPick(next);
  };

  return (
    <div className="mb-2">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Комната
      </span>
      <div className="flex items-center gap-1.5">
        <select
          value={String(group)}
          onChange={(e) => {
            if (e.target.value === "new") return startNew();
            setAdding(false);
            onPick(Number(e.target.value));
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {known.map((g) => (
            <option key={g} value={String(g)}>
              {text(g)}
            </option>
          ))}
          <option value="new">+ Новая комната</option>
        </select>
        <button
          type="button"
          onClick={startNew}
          aria-label="Новая комната"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Имя вводим и у новой комнаты, и у безымянной: назвать бывает
          нужнее, чем завести. */}
      {(adding || !names[String(group)]) && group !== PORTAL_DOOR && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={40}
            placeholder={`Название комнаты ${label(group)}`}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              onSave(group, draftName.trim());
              setAdding(false);
            }}
            disabled={saving || !draftName.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}
