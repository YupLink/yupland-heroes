// Подтверждение сжигания: сколько, с какого кошелька; PIN/пароль — только
// когда кошелёк YupLink их попросил.
import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

const field =
  "w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50";

export function BurnConfirm({
  open,
  count,
  wallet,
  busy,
  needPin,
  needPwd,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  wallet: string;
  busy: boolean;
  needPin: boolean;
  needPwd: boolean;
  onCancel: () => void;
  onConfirm: (secrets: { pin?: string; pwd?: string }) => void;
}) {
  const t = useT();
  const [pin, setPin] = useState("");
  const [pwd, setPwd] = useState("");
  const ready = (!needPin || pin.trim()) && (!needPwd || pwd.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <Flame className="h-6 w-6" />
          </span>
          <DialogTitle className="font-display text-xl font-bold">
            {t("burn.confirm_title", { n: count })}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{wallet}</span>
            <br />
            {t("burn.confirm_text")}
          </DialogDescription>
        </div>

        {(needPwd || needPin) && (
          <div className="mt-2 space-y-2">
            {needPwd && (
              <input
                type="password"
                autoComplete="current-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder={t("burn.app_pwd")}
                className={field}
              />
            )}
            {needPin && (
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("burn.pin")}
                className={field}
              />
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-border bg-secondary/40 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
          >
            {t("burn.cancel")}
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({ pin: needPin ? pin : undefined, pwd: needPwd ? pwd : undefined })
            }
            disabled={busy || !ready}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {t("burn.confirm_btn")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
