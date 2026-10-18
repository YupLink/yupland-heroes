// Форма набора: бокс из конструктора боксов и сколько штук, цена в $ (DARAI и
// Stars считаются от неё, как у подписки), тираж, лимит на аккаунт, вкл/выкл.
// Название и картинка — у бокса.
//
// Окно — как у формы турнира: снизу листом на телефоне, на ПК — у верха.
// Шапка и «Сохранить» закреплены, тело прокручивается своё. Ошибку показываем
// после первой попытки сохранить.
import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { KitBoxPicker } from "./KitBoxPicker";
import { kitDraftError, type KitDraft } from "./kitDraft";

const CAP = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const FIELD =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-gold/50";
const chip = (on: boolean) =>
  cn(
    "rounded-lg border px-3 py-2 text-sm font-medium transition",
    on
      ? "border-gold/50 bg-gold/15 text-gold"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  );

type NumKey = "boxCount" | "priceUsd" | "stock" | "perAccount";

export function KitEditor({
  value,
  onChange,
  onSave,
  saving,
  onClose,
}: {
  value: KitDraft;
  onChange: (next: KitDraft) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<KitDraft>) => onChange({ ...value, ...p });
  const err = kitDraftError(value);

  const submit = () => {
    setTried(true);
    if (!err) onSave();
  };

  const num = (key: NumKey, label: string, mode: "numeric" | "decimal", empty?: string) => (
    <label className="min-w-0">
      <span className={CAP}>{t(label)}</span>
      <input
        type="text"
        inputMode={mode}
        value={value[key]}
        onChange={(e) => patch({ [key]: e.target.value })}
        placeholder={empty}
        className={FIELD}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 truncate font-display text-lg font-bold">
            {t(value.id ? "kits.adm_edit" : "kits.adm_create")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("kits.adm_close")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <div>
            <span className={CAP}>{t("kits.adm_f_box")}</span>
            <KitBoxPicker value={value.box} onPick={(box) => patch({ box })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {num("boxCount", "kits.adm_f_count", "numeric")}
            {num("priceUsd", "kits.adm_f_price", "decimal")}
            {num("stock", "kits.adm_f_stock", "numeric", "∞")}
            {num("perAccount", "kits.adm_f_limit", "numeric", "∞")}
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => patch({ active: true })}
              className={chip(value.active)}
            >
              {t("kits.adm_on")}
            </button>
            <button
              type="button"
              onClick={() => patch({ active: false })}
              className={chip(!value.active)}
            >
              {t("kits.adm_off")}
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          {tried && err && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t(err)}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-semibold text-gold-foreground shadow-gold disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("kits.adm_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
