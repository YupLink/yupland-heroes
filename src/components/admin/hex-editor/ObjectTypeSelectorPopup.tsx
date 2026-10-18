import { Sparkles, X } from "lucide-react";
import { OBJECT_SUBS, type Cell, type ObjectSub } from "@/components/admin/hex-editor/hexShared";

// ─── Выбор типа объекта (попап) ───
export function ObjectTypeSelectorPopup({
  cellKey,
  cell,
  onClose,
  onSelect,
}: {
  cellKey: string;
  cell: Cell;
  onClose: () => void;
  onSelect: (sub: ObjectSub) => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          <span className="font-display text-lg font-bold">Выбери объект</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2">
          {OBJECT_SUBS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => onSelect(s.key)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-left transition hover:bg-secondary/40">
                <Icon className="h-5 w-5" style={{ color: s.color }} />
                <div>
                  <div className="text-sm font-bold">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.key === "boss" ? "Босс с HP и наградами" : s.key === "artifact" ? "Артефакт со статами" : s.key === "chest" ? "Сундук с лутом" : "Шахта с ресурсами"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
