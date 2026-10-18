// Редактирование объекта на карте (полноценный попап). Вынесено из
// admin.hex-editor.tsx при декомпозиции (§13 ПРАВИЛА.md).
import { useQueryClient } from "@tanstack/react-query";
import { parseObjectId, type Cell, type TerrainDef } from "@/components/admin/hex-editor/hexShared";
import { FullObjectEditor } from "@/components/admin/hex-editor/FullObjectEditor";

export function MapObjectEditor({
  cellKey,
  cell,
  onClose,
  onUpdated,
  onSaveToCell,
  terrains,
}: {
  cellKey: string;
  cell: Cell;
  onClose: () => void;
  onUpdated: () => void;
  onSaveToCell?: (cfg: Record<string, unknown> | null) => void;
  terrains: TerrainDef[];
}) {
  const parsed = cell.objectId ? parseObjectId(cell.objectId) : null;
  const sub = parsed?.sub;
  const refId = parsed?.refId;
  const qc = useQueryClient();

  if (!sub) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-muted-foreground">Нет объекта в этой клетке.</p>
          <button onClick={onClose} className="mt-3 w-full rounded-lg bg-secondary py-2 text-sm">
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  // Все типы объектов используют полный редактор.
  return (
    <FullObjectEditor
      sub={sub}
      refId={refId}
      cellKey={cellKey}
      onClose={onClose}
      onUpdated={onUpdated}
      onSaveToCell={onSaveToCell}
      terrains={terrains}
    />
  );
}
