import { useState } from "react";
import { EyeOff, Eye, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { HiddenItem } from "./shop-shared";

export function HiddenDropsSection({
  items,
  onUnhide,
  pendingId,
}: {
  items: HiddenItem[];
  onUnhide: (id: string) => void;
  pendingId: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-secondary/30"
      >
        <EyeOff className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {t("mynfts.hidden_section")}
        </span>
        <span className="text-xs text-muted-foreground">· {items.length}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/50 divide-y divide-border/40">
          {items.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs"
            >
              {h.mode === "combo" && (
                <span className="rounded bg-neon/15 px-1.5 py-0.5 text-[9px] font-medium text-neon">
                  combo
                </span>
              )}
              <span className="font-medium text-foreground">{h.name}</span>
              <span className="text-muted-foreground">→ {h.rewardSpec}</span>
              {h.status !== "active" && (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {h.status}
                </span>
              )}
              <button
                type="button"
                onClick={() => onUnhide(h.id)}
                disabled={pendingId === h.id}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/5 px-2 py-1 text-[10px] font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
              >
                {pendingId === h.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                {t("mynfts.hidden_unhide")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
