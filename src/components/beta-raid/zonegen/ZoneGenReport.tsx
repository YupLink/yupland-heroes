// Отчёт генератора: сколько клеток легло, сколько занятых пропущено, декор,
// разбивка по местностям именами (id админу ни о чём не говорят). Поселения —
// в той же рамке отдельным разделом: это один прогон, а не два.
import { useT } from "@/lib/i18n";
import type { ZoneReport } from "@/lib/raid/zonegen/recipe";
import { SettlementReportView } from "./SettlementReportView";

export function ZoneGenReport({
  report,
  names,
}: {
  report: ZoneReport;
  /** id местности → имя из справочника; нет имени — показываем id. */
  names: Map<string, string>;
}) {
  const t = useT();
  const rows = Object.entries(report.byTerrain).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 px-2 py-1 text-[10px] text-muted-foreground">
      <p className="tabular-nums">
        {t("zonegen.report", {
          cells: report.cells,
          skipped: report.skipped,
          decor: report.decor,
        })}
      </p>
      {report.single && <p>{t("zonegen.report_single")}</p>}
      {rows.length > 0 && (
        <p className="mt-0.5">
          <span className="font-semibold">{t("zonegen.report_by_terrain")}:</span>{" "}
          {rows.map(([id, n]) => `${names.get(id) ?? id} ${n}`).join(" · ")}
        </p>
      )}
      {report.settlement && <SettlementReportView report={report.settlement} />}
    </div>
  );
}
