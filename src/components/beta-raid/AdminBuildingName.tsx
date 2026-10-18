// Имя постройки прямо в шапке клетки: тап по карандашу → правка → Enter.
//
// Важное различие:
//  · клетка БЕЗ облика — карандаш правит имя базового шаблона (mystic_item_
//    template), меняется везде;
//  · клетка СО скином — карандаш правит имя СКИНА, а не базы. Иначе
//    переименование одного «Дома под мох» перекрашивало бы базу «Дом» и
//    портило все остальные её облики (жалоба владельца «переименовка идёт
//    не отдельного скина, а полностью блока относительно базы»).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { adminUpdateItem } from "@/api";
import { humanError } from "@/lib/humanError";
import { invalidateRaidMap } from "@/lib/query";
import { renameSkinImage } from "@/server/api/beta-raid/building-skins-api";
import { readDraftAssets, writeDraftAssets } from "./adminDraftStore";
import { assetKey } from "./cellAssets";

export function AdminBuildingName({
  baseId,
  baseName,
  skinId,
  skinName,
}: {
  /** id базовой постройки (без облика) — правится он, когда клетка без скина. */
  baseId: string | null;
  baseName: string;
  /** id надетого скина, если он есть. Правит имя ЭТОГО скина, не базы. */
  skinId: string | null;
  /** Отображаемое имя скина (то, что игрок видит на карте) — стартовое значение
   *  редактора. */
  skinName: string | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Что редактируем: у скин-клетки — имя скина, у обычной — базы.
  const editingSkin = !!skinId;
  const initial = editingSkin ? (skinName ?? "") : baseName;
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      if (editingSkin) {
        return renameSkinImage({ data: { id: skinId as string, name: next } });
      }
      const res = await adminUpdateItem({ data: { id: baseId as string, name: next } });
      // Только для базы: обновляем локальный снимок ассетов черновика,
      // иначе applyDraft перекладывает старое имя обратно в map.buildings.
      const snap = { ...readDraftAssets() };
      const key = assetKey("building", baseId as string);
      if (snap[key]) snap[key] = { ...snap[key], name: next };
      writeDraftAssets(snap);
      return res;
    },
    onSuccess: () => {
      toast.success(editingSkin ? "Название облика сохранено" : "Название сохранено");
      setEditing(false);
      // refetchType:"all" пробивает persist-кэш yuplink-rq-cache (24 ч).
      qc.invalidateQueries({ queryKey: ["admin-live-assets", "building"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["hex-editor-items"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["admin-building-skins"], refetchType: "all" });
      invalidateRaidMap(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const commit = () => {
    if (editingSkin ? !skinId : !baseId) return;
    const next = value.trim();
    if (!next) {
      toast.error("Название не может быть пустым");
      return;
    }
    if (next === initial) {
      setEditing(false);
      return;
    }
    save.mutate(next);
  };

  const cancel = () => {
    setValue(initial);
    setEditing(false);
  };

  const shown = editingSkin ? (skinName ?? baseName) : baseName;

  if (!baseId && !skinId) return <span>{shown}</span>;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="max-w-[200px] truncate" title={shown}>
          {shown}
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(initial);
            setEditing(true);
          }}
          title={editingSkin ? "Переименовать этот облик" : "Переименовать постройку"}
          className="grid h-4 w-4 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        maxLength={150}
        autoFocus
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-[12px]"
      />
      <button
        type="button"
        onClick={commit}
        disabled={save.isPending}
        title="Сохранить"
        className="grid h-5 w-5 place-items-center rounded bg-gold text-background disabled:opacity-50"
      >
        {save.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </button>
      <button
        type="button"
        onClick={cancel}
        title="Отмена"
        className="grid h-5 w-5 place-items-center rounded border border-border"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
