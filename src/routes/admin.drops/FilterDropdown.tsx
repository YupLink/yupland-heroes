import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const current = options.find((o) => o.value === value);
  const isDefault = value === options[0]?.value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
            isDefault
              ? "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
              : "border-gold/40 bg-gold/10 text-gold"
          )}
        >
          <span>{label}{!isDefault && current ? `: ${current.label}` : ""}</span>
          <ChevronDown className="h-3 w-3 transition group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={8} className="max-h-[60vh] min-w-[9rem] overflow-y-auto rounded-xl">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChange(o.value)}
            className={cn("flex items-center justify-between gap-3 text-xs", value === o.value ? "font-medium text-gold" : "text-foreground")}
          >
            <span>{o.label}</span>
            {value === o.value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
