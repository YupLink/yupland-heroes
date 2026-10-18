// Сворачиваемый раздел окна «Добыча».
//
// У игрока с десятком шахт и полей список не помещался на экран, а нужное —
// награды — оказывалось в самом низу. Теперь награды идут первыми и открыты, а
// шахты с полями сворачиваются: заголовок показывает, сколько внутри.
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function HarvestSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Число в заголовке: видно, есть ли смысл разворачивать. */
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && children}
    </section>
  );
}
