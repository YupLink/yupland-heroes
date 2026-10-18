// Плашка набора в админке: обложка и имя бокса × N, цена в $ и цены в валютах
// по курсу сейчас (для сверки, как у тарифа подписки), продано/тираж, лимит;
// действия — вкл/выкл, изменить, удалить. «Удалить» переспрашивает прямо на
// плашке, как у турниров.
import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { subPriceText } from "@/lib/energySub";
import { KIT_TOKENS, kitTitle, type KitAdminRow } from "@/lib/kits";

const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50";

/** 10 → «$10», 4.5 → «$4.50». */
const usd = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function KitPlate({
  row,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: KitAdminRow;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [ask, setAsk] = useState(false);
  const prices = KIT_TOKENS.map((tok) => {
    const v = row.prices?.[tok];
    return typeof v === "number" ? subPriceText(tok, v, lang) : `— ${tok}`;
  }).join(" · ");

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border bg-card p-3",
        row.active ? "border-gold/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {row.boxImage && (
          <img src={row.boxImage} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{kitTitle(row)}</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-gold">{usd(row.priceUsd)}</span>
            {" · "}
            {row.stock == null
              ? t("kits.adm_sold", { n: row.sold })
              : t("kits.adm_sold_of", { n: row.sold, total: row.stock })}
            {row.perAccount != null && ` · ${t("kits.adm_limit", { n: row.perAccount })}`}
          </div>
          <div className="text-[11px] text-muted-foreground">{prices}</div>
        </div>
      </div>

      {ask ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
          <p className="text-xs">{t("kits.adm_delete_q")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onDelete();
                setAsk(false);
              }}
              className={cn(BTN, "bg-destructive text-destructive-foreground")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("kits.adm_delete_yes")}
            </button>
            <button type="button" onClick={() => setAsk(false)} className={cn(BTN, "bg-secondary")}>
              {t("kits.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onToggle}
            className={cn(
              BTN,
              row.active ? "bg-gold/15 text-gold" : "bg-secondary text-muted-foreground",
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(row.active ? "kits.adm_on" : "kits.adm_off")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className={cn(BTN, "bg-secondary")}
          >
            <Pencil className="h-4 w-4" /> {t("kits.adm_edit_btn")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk(true)}
            className={cn(BTN, "bg-secondary text-destructive")}
          >
            <Trash2 className="h-4 w-4" /> {t("kits.adm_delete")}
          </button>
        </div>
      )}
    </div>
  );
}
