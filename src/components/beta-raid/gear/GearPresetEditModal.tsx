// Окно комплекта: назвать новый, переименовать старый, перезаписать текущим
// набором или удалить.
//
// Отдельным файлом от полосы чипов: там — список и надевание, здесь — правка.
// На телефоне это разные жесты и разные ошибки, мешать их в одном файле значит
// растить его до неподъёмного.
import { useState } from "react";
import { TavernDialog } from "@/components/castle-live/TavernDialog";
import { Check, Loader2, Save, Trash2, X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";

export function GearPresetEditModal({
  preset,
  busy,
  onSave,
  onOverwrite,
  onDelete,
  pinned,
  onTogglePin,
  onClose,
}: {
  /** null — создаём новый комплект из того, что сейчас на герое. */
  preset: { id: string; name: string } | null;
  busy: boolean;
  onSave: (name: string) => void;
  /** Записать в существующий комплект текущую одежду героя. */
  onOverwrite: () => void;
  onDelete: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [name, setName] = useState(preset?.name ?? "");

  return (
    <TavernDialog title={preset ? t("braid.preset_edit") : t("braid.preset_new")} onClose={onClose} locked={busy} className="w-full max-w-sm border border-[#655a43] bg-[#0c1014] p-4">
      <div data-preset-dialog>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-base font-bold">
            {preset ? t("braid.preset_edit") : t("braid.preset_new")}
          </h3>
          <button data-close-button data-game-button="icon"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          aria-label={t("braid.preset_name_hint")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t("braid.preset_name_hint")}
          className="mb-3 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/60"
        />

        <button data-game-button="primary"
          type="button"
          onClick={() => onSave(name.trim())}
          disabled={busy || !name.trim()}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {preset ? t("braid.preset_rename") : t("braid.preset_save_current")}
        </button>

        {preset && (
          <>
            {/* Перезапись — главный смысл правки: набор собрали заново, а имя
                оставили прежним. */}
            <button data-game-button="secondary"
              type="button"
              onClick={onOverwrite}
              disabled={busy}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm font-bold text-gold disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t("braid.preset_overwrite")}
            </button>
            <button data-game-button="secondary"
              data-preset-pin-action
              type="button"
              onClick={onTogglePin}
              disabled={busy}
              aria-pressed={pinned}
              aria-label={pinned ? (lang === "ru" ? "Открепить от быстрого доступа" : "Unpin from quick access") : (lang === "ru" ? "Закрепить для быстрого доступа" : "Pin for quick access")}
              className="mb-2 flex w-full items-center justify-center rounded-lg border border-[#53606d] px-4 py-3 text-sm text-[#d0d8df] disabled:opacity-50"
            >{pinned ? (lang === "ru" ? "Открепить от быстрого доступа" : "Unpin from quick access") : (lang === "ru" ? "Закрепить для быстрого доступа" : "Pin for quick access")}</button>
            <button data-game-button="danger"
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-destructive/40 px-4 py-3 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {t("braid.preset_delete")}
            </button>
          </>
        )}
      </div>
    </TavernDialog>
  );
}
