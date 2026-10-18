// Классы формы турнира: подпись поля, поле ввода и чип выбора — общие для
// формы, расписания и довыбора приза.
import { cn } from "@/lib/utils";

export const CAP =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

export const FIELD =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-gold/50";

const CHIP = "rounded-lg border px-2.5 py-1.5 text-sm font-medium transition";

export const chipCls = (on: boolean): string =>
  cn(
    CHIP,
    on
      ? "border-gold/50 bg-gold/15 text-gold"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  );
