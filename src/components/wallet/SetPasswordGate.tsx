// Обязательный пароль кошелька (11.11.2026): им шифруются ключи кошельков на
// устройстве (walletVault). Пока его нет — раздел кошелька показывает только это.
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { hasAppPassword, setupAppPassword } from "@/lib/appLock";
import { PwdInput } from "@/routes/admin.wallet/inputs";

export function SetPasswordGate({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p1 !== p2) return void toast.error(t("wvault.mismatch"));
    setBusy(true);
    try {
      await setupAppPassword(p1);
      toast.success(t("wvault.done"));
      onDone();
    } catch (err) {
      // Пароль на устройстве уже был (вернулся из записей кошельков) — к вводу.
      if (hasAppPassword()) {
        toast.error(t("wvault.exists"));
        return onDone();
      }
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-6 text-center shadow-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold">
        <Lock className="h-8 w-8" />
      </div>
      <h2 className="font-display text-xl font-bold">{t("wvault.title")}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{t("wvault.text")}</p>
      <form onSubmit={submit} className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
        <PwdInput value={p1} onChange={setP1} label={t("wvault.pwd")} />
        <PwdInput value={p2} onChange={setP2} label={t("wvault.pwd2")} autoFocus={false} />
        <button
          type="submit"
          disabled={busy || p1.length < 8 || !p2}
          className="flex items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("wvault.submit")}
        </button>
      </form>
    </section>
  );
}
