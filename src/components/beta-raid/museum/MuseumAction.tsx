// Блок музея в окне постройки: вход в сбор билетов с коллекций.
//
// Пока музей на тире 1 (в коде tier=0) — это стройка: здание не открывается
// вовсе. С тира 2 (tier>=1) музей работает, и открывается окно с коллекциями.
// Дальше тир — только улучшения облика.
import { useState } from "react";
import { Landmark } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MuseumModal } from "./MuseumModal";

export function MuseumAction({ q, r, built }: { q: number; r: number; built: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!built) {
    return (
      <p className="rounded-2xl border border-border/60 bg-secondary/20 p-3 text-center text-xs text-muted-foreground">
        {t("braid.museum_unfinished")}
      </p>
    );
  }
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground"
      >
        <Landmark className="h-4 w-4" />
        {t("braid.museum_open")}
      </button>
      {open && <MuseumModal q={q} r={r} onClose={() => setOpen(false)} />}
    </div>
  );
}
