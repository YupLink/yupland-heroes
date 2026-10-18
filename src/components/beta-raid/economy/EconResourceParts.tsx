// Куски вкладки «Ресурс»: колонка «kind → сумма» (источники/стоки), таблица
// по дням и топ-списки игроков. Отдельный модуль — чтобы EconResourceTab
// остался ≤250 строк.
import { useLang, useT } from "@/lib/i18n";
import type { DeltaRow, KindAmount, ResourceDay } from "@/lib/econ/types";
import { fmt } from "./economyFormat";
import { fmtDay, groupLabel } from "./econLabels";
import { Signed } from "./EconShared";

// Заголовок таблицы по дням НЕ липкий: таблица живёт в карточке под
// панелью фильтра (z-40), липкий top-0 уехал бы под неё.
const TH = "border-b border-border px-2 py-2 font-semibold";

export function KindColumn({ title, items }: { title: string; items: KindAmount[] }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-secondary/20">
      <header className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </header>
      {items.length === 0 ? (
        <div className="p-3 text-[11px] text-muted-foreground">{t("econ.none")}</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((k) => (
            <li key={k.kind} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="truncate">{groupLabel(t, k.group)}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {k.kind} <span className="opacity-60">×{fmt(k.n)}</span>
                </div>
              </div>
              <Signed v={k.amount} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DaysTable({ days }: { days: ResourceDay[] }) {
  const t = useT();
  const lang = useLang();
  if (days.length === 0) {
    return <div className="p-3 text-[11px] text-muted-foreground">{t("econ.none")}</div>;
  }
  return (
    <table className="min-w-full border-collapse text-[12px]">
      <thead className="text-[10px] uppercase text-muted-foreground">
        <tr>
          <th className={`${TH} text-left`}>{t("econ.col.day")}</th>
          <th className={`${TH} text-right`}>+</th>
          <th className={`${TH} text-right`}>−</th>
          <th className={`${TH} text-right`}>{t("econ.col.net")}</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day} className="border-b border-border/60">
            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{fmtDay(d.day, lang)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">
              {d.plus === 0 ? "·" : fmt(d.plus)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-red-300">
              {d.minus === 0 ? "·" : fmt(d.minus)}
            </td>
            <td className="px-2 py-1.5 text-right font-semibold">
              <Signed v={d.plus - d.minus} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TopList({ title, rows }: { title: string; rows: DeltaRow[] }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-secondary/20">
      <header className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </header>
      {rows.length === 0 ? (
        <div className="p-3 text-[11px] text-muted-foreground">{t("econ.none")}</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <li
              key={`${r.accountId}:${r.currency}`}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px]"
            >
              <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold" title={r.accountId}>
                {r.displayName}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                +{fmt(r.earned)} / −{fmt(r.spent)}
              </span>
              <Signed v={r.net} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
