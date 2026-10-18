// Одна строка отчёта восстановления: вид объекта, сколько штук и на сколько
// денег каждой валюты.
//
// Обе валюты пишем ВСЕГДА, даже нулём. И строки показываем ВСЕ, включая
// невыбранные: вся раздача USDT сидит в объектах с одним HP («Мухомор»), а те
// по внутреннему делению — «Монетки», хотя правят их кистью «Сундуки».
// Выбрав сундуки, админ видел «USDT: 0» и читал это как враньё. Теперь
// невыбранная строка стоит серой рядом и показывает, где деньги на самом деле.
import { cn } from "@/lib/utils";
import type { PreviewRow } from "@/server/api/beta-raid/admin-restore-preview";
import { fmtDarai, fmtUsdt } from "./restoreFormat";

/** Сложить все группы вида: строке нужны итоги по валютам, не разбивка. */
function money(row: PreviewRow | undefined) {
  const acc = { darai: 0, usdt: 0 };
  for (const g of Object.values(row?.groups ?? {})) {
    acc.darai += g.darai;
    acc.usdt += g.usdt;
  }
  return acc;
}

export function RestoreKindRow({
  label,
  row,
  off = false,
}: {
  label: string;
  row: PreviewRow | undefined;
  /** Вид не выбран: строка справочная, в итог не идёт. */
  off?: boolean;
}) {
  const m = money(row);
  return (
    <div className={cn("p-2.5 text-sm", off && "opacity-45")}>
      <div className="flex items-center justify-between">
        <span>
          {label}
          {off && <span className="ml-1.5 text-[10px] text-muted-foreground">не выбрано</span>}
        </span>
        <b className={cn("tabular-nums", off ? "text-muted-foreground" : "text-gold")}>
          {row?.total ?? 0}
        </b>
      </div>
      <div className="mt-0.5 flex gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">Дараев: {fmtDarai(m.darai)}</span>
        <span className="tabular-nums">USDT: {fmtUsdt(m.usdt)}</span>
      </div>
    </div>
  );
}
