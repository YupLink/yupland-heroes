import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleCarousel({
  title,
  icon,
  count,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  count: number;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-secondary/30"
      >
        {icon}
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">· {count}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground">· {hint}</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition",
            open && "rotate-180 text-gold"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/50 p-3">
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
            {children}
          </div>
        </div>
      )}
    </section>
  );
}
