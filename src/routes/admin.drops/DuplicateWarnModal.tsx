import { createPortal } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";

export function DuplicateWarnModal({
  titles,
  isPending,
  onCancel,
  onConfirm,
}: {
  titles: string[];
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={isPending ? undefined : onCancel}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/40 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {isPending ? (
          <div className="flex flex-col items-center gap-4 px-8 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
            <div className="text-center">
              <div className="font-display text-base font-bold">Создаём дубль…</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Не закрывай страницу.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-amber-500/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <span className="font-display text-base font-bold">Такой дроп уже есть</span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              <p className="text-muted-foreground">
                У этих NFT уже есть активный дроп с такими же параметрами
                (name + контракт + награда + цена). Точно создать дубликат?
              </p>
              <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[11px]">
                {titles.map((t, i) => (
                  <div key={i} className="truncate">• {t}</div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-amber-500/30 px-5 py-4">
              <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
                Отмена
              </button>
              <button type="button" onClick={onConfirm} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-background transition hover:bg-amber-400">
                Создать всё равно
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
