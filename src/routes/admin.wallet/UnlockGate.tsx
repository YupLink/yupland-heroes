import { useState } from "react";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import { unlockApp } from "@/lib/appLock";
import { listLocalWallets, removeLocalWallet } from "@/lib/embeddedWallet";
import { resetAppLockForce } from "@/lib/appLock";
import { PwdInput } from "./inputs";

export function UnlockGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd) return;
    setBusy(true);
    try {
      await unlockApp(pwd);
      setPwd("");
      onUnlocked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      const list = await listLocalWallets();
      for (const a of list) await removeLocalWallet(a);
      resetAppLockForce();
      toast.success("Пароль сброшен — войди по сид-фразе");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-6 text-center shadow-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold glow-gold">
        <Lock className="h-8 w-8" />
      </div>
      <h2 className="font-display text-xl font-bold">Кошелёк заблокирован</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Введи пароль кошелька, чтобы открыть баланс и действия.
      </p>
      <form onSubmit={submit} className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
        <PwdInput value={pwd} onChange={setPwd} label="Пароль кошелька" />
        <button
          type="submit"
          disabled={busy || !pwd}
          className="flex items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Разблокировать
        </button>
      </form>
      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="mx-auto mt-3 block max-w-xs text-[11px] text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
        >
          Забыл пароль?
        </button>
      ) : (
        <div className="mx-auto mt-3 max-w-xs space-y-2 rounded-xl border border-warning/40 bg-warning/[0.06] p-3 text-left">
          <div className="text-[11px] leading-snug text-warning/90">
            Сброс снимет пароль и удалит кошелёк с этого устройства. Вернёшь его
            импортом по сид-фразе (12 слов) или серверному бэкапу. Без сид-фразы
            доступа к деньгам нет.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmReset(false)} disabled={busy} className="rounded-lg border border-border bg-card px-2 py-2 text-xs">
              Отмена
            </button>
            <button onClick={doReset} disabled={busy} className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs font-bold text-destructive disabled:opacity-50">
              {busy ? "…" : "Сбросить"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
