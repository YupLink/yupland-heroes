// «Забыть заклинание?» — одно окно на книгу героя и на столб.
//
// Забвение тратит эффект «Забвение» (книга) или деньги (столб), а выученное
// назад — снова за плату, поэтому промах пальцем по «Забыть» не должен стирать
// заклинание сразу. У столба на кнопке — его «Цена забвения».
//
// Портал в body и z-[130]: окно открывается поверх модалки героя/замка/столба
// (z-[120]). Клики гасим на своём же фоне — события портала всплывают по
// дереву React, и тап мимо окна иначе закрыл бы заодно и окно под ним.
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { BookMinus, Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";

export function SpellForgetConfirm({
  name,
  image,
  price = null,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  image: string | null;
  /** Цена забвения у столба; из книги (эффектом) — нет. */
  price?: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <ResourceActionDialog
      title={t("braid.spell_forget_ask", { name })}
      busy={busy}
      onClose={onCancel}
      overlayClassName="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      className="mb-[calc(env(safe-area-inset-bottom)+84px)] w-full max-w-sm rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:rounded-3xl"
    >
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary/40">
            {image ? (
              <img src={thumb(image, 96, "black")} alt="" className="h-full w-full object-cover" />
            ) : (
              <Sparkles className="h-5 w-5 text-gold/40" />
            )}
          </div>
          <h3
            className="min-w-0 flex-1 break-words font-display text-base font-bold leading-tight"
          >
            {t("braid.spell_forget_ask", { name })}
          </h3>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-destructive/50 bg-destructive/15 px-4 py-3 text-sm font-bold text-destructive disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookMinus className="h-4 w-4" />
            )}
            <span className="min-w-0 break-words">
              {price ? `${t("braid.spell_forget")} · ${price}` : t("braid.spell_forget")}
            </span>
          </button>
        </div>
    </ResourceActionDialog>
  );
}
