import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import {
  hasAppPassword,
  isAppUnlocked,
  appUnlockSecondsLeft,
  setupAppPassword,
  unlockApp,
  changeAppPassword,
  removeAppPassword,
  lockApp,
  getAutoLockMs,
  setAutoLockMs,
} from "@/lib/appLock";
import { PwdInput } from "./inputs";
import { AUTOLOCK_OPTIONS, fmtLockLeft } from "./helpers";
import { cn } from "@/lib/utils";

export function AppLockPanel() {
  const [, force] = useState(0);
  const [mode, setMode] = useState<"idle" | "setup" | "unlock" | "change" | "remove">("idle");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [oldp, setOldp] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [autoLock, setAutoLockState] = useState<number>(() => getAutoLockMs());

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(appUnlockSecondsLeft());
      force((n) => n + 1);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const installed = hasAppPassword();
  const unlocked = isAppUnlocked();

  const reset = () => { setP1(""); setP2(""); setOldp(""); setMode("idle"); };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const doSetup = () => {
    if (p1 !== p2) return toast.error("Пароли не совпадают");
    return run(() => setupAppPassword(p1), "Пароль кошелька установлен");
  };
  const doUnlock = () => run(() => unlockApp(p1), "Разблокировано");
  const doChange = () => {
    if (p1 !== p2) return toast.error("Новые пароли не совпадают");
    return run(() => changeAppPassword(oldp, p1), "Пароль изменён");
  };
  const doRemove = () => run(() => removeAppPassword(oldp), "Пароль снят");

  const statusTitle = !installed
    ? "Пароль не установлен"
    : unlocked ? `Разблокировано · ${fmtLockLeft(secondsLeft)}` : "Заблокировано";
  const statusSub = !installed
    ? "Замок на вход и показ ключа"
    : unlocked ? "Авто-лок по таймеру бездействия" : "Введи пароль, чтобы открыть кошелёк";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          installed && unlocked ? "bg-success/10 text-success" : installed ? "bg-amber-400/10 text-amber-400" : "bg-gold/10 text-gold"
        )}>
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{statusTitle}</div>
          <div className="truncate text-[11px] text-muted-foreground">{statusSub}</div>
        </div>
        {mode === "idle" && (
          <>
            {!installed && (
              <button onClick={() => setMode("setup")} className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/15">
                Установить
              </button>
            )}
            {installed && !unlocked && (
              <button onClick={() => setMode("unlock")} className="shrink-0 rounded-full border border-success/40 bg-success/10 px-3.5 py-1.5 text-[11px] font-semibold text-success transition hover:bg-success/15">
                Разблокировать
              </button>
            )}
            {installed && unlocked && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => setMode("change")} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                  Сменить
                </button>
                <button onClick={() => { lockApp(); toast.success("Заблокировано"); }} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-destructive" title="Заблокировать сейчас">
                  Запереть
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {installed && mode === "idle" && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground">Спрашивать пароль после простоя</span>
          <select
            value={String(autoLock)}
            onChange={(e) => {
              const ms = Number(e.target.value);
              setAutoLockState(ms);
              setAutoLockMs(ms);
              toast.success("Авто-лок обновлён");
            }}
            className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] outline-none focus:border-gold/50"
          >
            {AUTOLOCK_OPTIONS.map((o) => (
              <option key={o.ms} value={String(o.ms)}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
      {mode === "setup" && (
        <form onSubmit={(e) => { e.preventDefault(); doSetup(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PwdInput value={p1} onChange={setP1} label="Новый пароль (мин 8)" />
          <PwdInput value={p2} onChange={setP2} label="Повтори пароль" autoFocus={false} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || p1.length < 8} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Установить"}
            </button>
          </div>
        </form>
      )}
      {mode === "unlock" && (
        <form onSubmit={(e) => { e.preventDefault(); doUnlock(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PwdInput value={p1} onChange={setP1} label="Пароль кошелька" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || p1.length < 1} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Разблокировать"}
            </button>
          </div>
        </form>
      )}
      {mode === "change" && (
        <form onSubmit={(e) => { e.preventDefault(); doChange(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PwdInput value={oldp} onChange={setOldp} label="Текущий пароль" />
          <PwdInput value={p1} onChange={setP1} label="Новый пароль (мин 8)" autoFocus={false} />
          <PwdInput value={p2} onChange={setP2} label="Повтори новый пароль" autoFocus={false} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("remove")} className="rounded-full border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Снять пароль
            </button>
            <button type="submit" disabled={busy || p1.length < 8} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Сменить"}
            </button>
          </div>
        </form>
      )}
      {mode === "remove" && (
        <form onSubmit={(e) => { e.preventDefault(); doRemove(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <div className="text-[11px] text-muted-foreground">
            Снять пароль — вход и показ ключа снова без пароля. Подтверди текущим паролем.
          </div>
          <PwdInput value={oldp} onChange={setOldp} label="Текущий пароль" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || oldp.length < 1} className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50">
              {busy ? "…" : "Снять пароль"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
