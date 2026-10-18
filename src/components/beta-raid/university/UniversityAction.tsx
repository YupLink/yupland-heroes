// Блок университета в окне постройки: сводка и вход в стейкинг.
//
// Отдельным файлом, потому что BuildingExtraActions держит все постройки разом
// и упирается в лимит файла (§ модульность) — у маркета и таблички так же.
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { bonusLabel, likesLabel } from "@/lib/university";
import { UniversityModal } from "./UniversityModal";

export function UniversityAction({
  q,
  r,
  level,
  bonus,
  staked,
  pending,
}: {
  q: number;
  r: number;
  level: number;
  bonus: number;
  staked: number;
  /** Накоплено в базовых лайках — множитель применяем при показе. */
  pending: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Первый тир — стройка: работать нечему, и кнопку показывать не за чем.
  if (level <= 0) {
    return (
      <p className="rounded-2xl border border-border/60 bg-secondary/20 p-3 text-center text-xs text-muted-foreground">
        {t("braid.uni_unfinished")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">
          {t("braid.uni_summary", { lv: level, mult: bonusLabel(level), n: staked })}
        </b>
      </div>
      {pending > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("braid.uni_pending")}: {likesLabel(pending * bonus)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground"
      >
        <GraduationCap className="h-4 w-4" />
        {t("braid.uni_open")}
      </button>
      {open && <UniversityModal q={q} r={r} onClose={() => setOpen(false)} />}
    </div>
  );
}
