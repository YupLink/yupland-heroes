// Постройка с поведением «Казино»: кнопка «Играть» открывает слот на золото.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchSlot } from "@/lib/slot/prefetchSlot";
import { useT } from "@/lib/i18n";
import { CasinoOverlay } from "./CasinoOverlay";

export function CasinoAction() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  // Окно постройки открыто — код и свежий счёт автомата грузим сразу, до «Играть».
  useEffect(() => prefetchSlot(qc), [qc]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl gradient-gold py-3 font-display text-sm font-bold uppercase tracking-wider text-gold-foreground shadow-gold"
      >
        {t("slot.casino_open")}
      </button>
      <CasinoOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
