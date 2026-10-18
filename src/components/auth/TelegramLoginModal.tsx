// Окно входа для гостя вне Telegram (владелец, 18.10.2026): в игру входят только
// через Telegram. Раньше на этом месте было «Выбери, как войти» с кошельками —
// теперь кошелёк добавляется к Telegram уже в игре, с подписью.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { inTelegramMiniApp, runTelegramLogin, useTgLogin } from "@/lib/auth/telegramLogin";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

export function TelegramLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const loggedIn = useAppStore((s) => s.walletConnected);
  const pending = useTgLogin((s) => s.state === "pending");
  const [inTelegram] = useState(inTelegramMiniApp);
  // Вошёл (виджетом или повтором в мини-аппе) — окно больше не нужно.
  useEffect(() => {
    if (open && loggedIn) onClose();
  }, [open, loggedIn, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-login-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id="tg-login-title" className="font-display text-lg font-bold">
            {t("auth.tg_login")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{t("auth.tg_login_desc")}</p>
        {inTelegram ? (
          // В мини-аппе виджета нет: вход — повтором по данным Telegram.
          <button
            type="button"
            disabled={pending}
            onClick={() => void runTelegramLogin(qc)}
            className="w-full rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {pending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {t("auth.tg_login")}
          </button>
        ) : (
          <TelegramLoginButton />
        )}
      </div>
    </div>
  );
}
