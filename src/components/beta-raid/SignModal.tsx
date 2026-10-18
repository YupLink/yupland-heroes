// Табличка: то, что админ оставил героям. Читать бесплатно.
import { ScrollText, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export function SignModal({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border border-gold/30 bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
            <ScrollText className="h-3.5 w-3.5" />
            {t("braid.sign_title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="whitespace-pre-wrap text-center text-sm leading-relaxed">
          {text.trim() || t("braid.sign_faded")}
        </p>
      </div>
    </div>
  );
}
