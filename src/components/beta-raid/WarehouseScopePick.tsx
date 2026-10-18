// Куда класть со склада: сам решит, только себе или на общую полку.
//
// Раньше выбора не было — вещи шли сперва в личные ячейки, остаток на общую.
// Игроки жаловались: хотел приберечь себе, а ушло в общее, откуда забирает
// первый встречный. Кнопка запоминает выбор на время окна.
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DepositScope } from "@/lib/warehouseCells";

const OPTIONS: Array<{ key: DepositScope; label: string }> = [
  { key: "auto", label: "braid.wh_scope_auto" },
  { key: "own", label: "braid.wh_scope_own" },
  { key: "shared", label: "braid.wh_scope_shared" },
];

export function WarehouseScopePick({
  value,
  onChange,
}: {
  value: DepositScope;
  onChange: (v: DepositScope) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/40 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "flex-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold",
            value === o.key ? "bg-gold text-gold-foreground" : "text-muted-foreground",
          )}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}
