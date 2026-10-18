// Отчёт по поселениям: сколько встало, из чего и что не влезло.
//
// Разбивка по ИМЕНАМ приходит с сервера готовой (byBuilding): id шаблона
// админу ни о чём не говорит, а справочник ради отчёта тянуть незачем.
//
// Живой рост докладывает ещё и ФОРМУ: она не выбирается, а выходит из числа
// построек, въездов и воды (классификация сельских форм — шаг 3
// docs/town-generation-algorithm.json). Без этой строки «почему не городок, а
// хутор» пришлось бы угадывать по картинке.
import { useT } from "@/lib/i18n";
import type { SettlementReport } from "@/lib/raid/zonegen/settlement-types";
import { formKey } from "./settlementAuto";

export function SettlementReportView({ report }: { report: SettlementReport }) {
  const t = useT();
  const rows = Object.entries(report.byBuilding).sort((a, b) => b[1] - a[1]);
  // Незнакомую форму (сервер научился новой раньше словаря) показываем как
  // пришла: t возвращает сам ключ, когда перевода нет.
  const formName = (form: string): string => {
    const text = t(formKey(form));
    return text === formKey(form) ? form : text;
  };
  return (
    <div className="mt-0.5 border-t border-border/60 pt-0.5">
      {report.form ? (
        <>
          <p className="tabular-nums">
            {t("zonegen.set_report_form", {
              form: formName(report.form),
              theme: report.theme || t("zonegen.set_theme_none"),
              gates: report.gates ?? 0,
              buildings: report.buildings,
              road: report.roadCells,
            })}
          </p>
          {report.places > 1 && (
            <p className="tabular-nums">
              {t("zonegen.set_report_count", { places: report.places })}
            </p>
          )}
        </>
      ) : (
        <p className="tabular-nums">
          {t("zonegen.set_report", {
            places: report.places,
            buildings: report.buildings,
            road: report.roadCells,
          })}
        </p>
      )}
      {rows.length > 0 && (
        <p>
          <span className="font-semibold">{t("zonegen.set_report_by")}:</span>{" "}
          {rows.map(([name, n]) => `${name} ${n}`).join(" · ")}
        </p>
      )}
      {report.shortfall > 0 && (
        <p className="text-amber-300">{t("zonegen.set_report_short", { n: report.shortfall })}</p>
      )}
    </div>
  );
}
