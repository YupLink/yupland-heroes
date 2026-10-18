// Кнопка «Переместить» в строке окна клетки (режим бога) — одна на все виды.
import { Move } from "lucide-react";
import { useT } from "@/lib/i18n";
import { btn } from "@/components/beta-raid/AdminCellRow";

export function GodMoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useT();
  return (
    <button type="button" disabled={disabled} className={btn} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        <Move className="h-3 w-3" /> {t("godmove.move")}
      </span>
    </button>
  );
}
