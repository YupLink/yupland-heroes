import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export function ClaimingOverlay() {
  const t = useT();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/40 bg-card px-8 py-6 shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-gold" />
        <div className="text-center">
          <div className="font-display text-base font-bold">
            {t("mynfts.sending")}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("mynfts.dont_close_page")}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
