// Блок постройки «Турнир» в окне постройки: вход в окно турниров.
//
// Поведение админ ставит на любую постройку; тир не важен. Кто стоит рядом,
// проверяют ручки окна (tour-read.ts) — окно покажет их ошибку.
import { useState } from "react";
import { Trophy } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TournamentModal } from "./TournamentModal";

export function TournamentAction({ q, r }: { q: number; r: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground"
      >
        <Trophy className="h-4 w-4" />
        {t("tour.open")}
      </button>
      {open && <TournamentModal q={q} r={r} onClose={() => setOpen(false)} />}
    </div>
  );
}
