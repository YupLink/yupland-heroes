// ПвП фишек выключен (владелец, 13.10.2026): вместо экрана боёв — короткая
// заглушка. Сюда попадают по старой ссылке /chips/pvp: кнопки на главной нет.
import { ArrowLeft, Swords } from "lucide-react";
import { useT } from "@/lib/i18n";

export function PvpOff({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label={t("chips.pvp_off_back")}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 text-center">
        <Swords className="h-8 w-8 text-muted-foreground" />
        <h2 className="font-display text-lg font-bold">{t("chips.pvp_off_title")}</h2>
      </div>
    </div>
  );
}
