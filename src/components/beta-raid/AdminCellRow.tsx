// Строка состава клетки и вид кнопки при ней — общая мелочь админ-окна.
//
// Вынесено из AdminCellState (правило ≤250 строк): само окно доросло до
// потолка, и часть строк уехала в свои файлы. Чтобы разъехавшиеся строки
// выглядели одинаково, разметка живёт в одном месте, а не копируется.

/** Строка «подпись — содержимое»: подпись фиксированной ширины, остальное переносится. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[12px]">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</span>
    </div>
  );
}

/** Кнопка при строке состава: «убрать», «настроить», «+»/«−». */
export const btn =
  "rounded-lg border border-border px-2 py-1 text-[11px] font-semibold disabled:opacity-50";
