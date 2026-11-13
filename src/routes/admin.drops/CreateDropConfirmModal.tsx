import { createPortal } from "react-dom";
import { Sparkles, Plus, Loader2 } from "lucide-react";
import { goldFromTicketCost } from "./goldCost";

export function CreateDropConfirmModal({
  summary,
  isPending,
  kind,
  onCancel,
  onConfirm,
}: {
  summary: {
    titles: string[];
    rewardLine: string;
    freeClaim: boolean;
    ticketCost: number;
  };
  isPending: boolean;
  kind: "simple" | "combo";
  onCancel: () => void;
  onConfirm: (allowDuplicate: boolean) => void;
}) {
  void kind;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={isPending ? undefined : onCancel}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gold/40 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {isPending ? (
          <div className="flex flex-col items-center gap-4 px-8 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-gold" />
            <div className="text-center">
              <div className="font-display text-base font-bold">Создаём дроп{summary.titles.length > 1 ? "ы" : ""}…</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Не закрывай страницу. Подожди завершения.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-gold" />
                <span className="font-display text-base font-bold">Подтверди создание</span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">NFT в дропе ({summary.titles.length})</div>
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-border bg-secondary/20 p-2 font-mono text-[11px]">
                  {summary.titles.map((t, i) => (
                    <div key={i} className="truncate">• {t}</div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-secondary/20 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Награда</div>
                  <div className="mt-0.5 truncate font-medium">{summary.rewardLine}</div>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Цена клейма</div>
                  <div className="mt-0.5 font-medium">
                    {summary.freeClaim ? "Бесплатно" : `${goldFromTicketCost(summary.ticketCost)} золота`}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border/60 px-5 py-4">
              <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
                Отмена
              </button>
              <button type="button" onClick={() => onConfirm(false)} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]">
                <Plus className="h-4 w-4" />
                Создать
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
