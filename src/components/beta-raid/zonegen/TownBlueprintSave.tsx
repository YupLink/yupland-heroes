// Поле имени для «Сохранить как…»: имя, галка, крестик.
//
// Отдельным компонентом, чтобы строка шаблонов осталась про выбор и перенос, а
// не про ввод. prompt() здесь не годится: в вебвью Telegram он блокирует и
// иногда просто не показывается.
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";

const BTN =
  "inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40";

export function TownBlueprintSave({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  /** Имя уже очищено от пробелов и непустое. */
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const clean = name.trim();

  const submit = () => {
    if (clean) onSave(clean);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={t("zonegen.bp_name")}
        maxLength={40}
        autoFocus
        className="min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !clean}
        className={`${BTN} border-gold/50 bg-gold/10 text-gold`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {t("zonegen.bp_save_do")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={`${BTN} border-border bg-secondary/40 text-muted-foreground`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
