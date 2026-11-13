// Постройка с поведением «Корона гречневого королевства»: кнопка «Играть»
// открывает мини-игру на золото.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { BuckwheatOverlay } from "./BuckwheatOverlay";

export function BuckwheatAction() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl gradient-gold py-3 font-display text-sm font-bold uppercase tracking-wider text-gold-foreground shadow-gold"
      >
        {t("bw.play")}
      </button>
      <BuckwheatOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
