import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Shield,
  Lock,
} from "lucide-react";
import {
  hasMasterPin,
  isMasterUnlocked,
  setupMasterPin,
  unlockMaster,
  lockMaster,
  changeMasterPin,
  masterUnlockSecondsLeft,
} from "@/lib/masterKey";
import { PinInput } from "./inputs";
import { cn } from "@/lib/utils";

export function MasterPinPanel() {
  const [, force] = useState(0);
  const [mode, setMode] = useState<"idle" | "setup" | "unlock" | "change">("idle");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const left = masterUnlockSecondsLeft();
      setSecondsLeft(left);
      force((n) => n + 1);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const installed = hasMasterPin();
  const unlocked = isMasterUnlocked();

  const reset = () => {
    setPin1("");
    setPin2("");
    setOldPin("");
    setMode("idle");
  };

  const doSetup = async () => {
    if (pin1 !== pin2) { toast.error("PIN'ы не совпадают"); return; }
    setBusy(true);
    try { await setupMasterPin(pin1); toast.success("Общий PIN установлен"); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const doUnlock = async () => {
    setBusy(true);
    try { await unlockMaster(pin1); toast.success("Кошелёк разблокирован на 5 минут"); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const doChange = async () => {
    if (pin1 !== pin2) { toast.error("Новые PIN'ы не совпадают"); return; }
    setBusy(true);
    try { await changeMasterPin(oldPin, pin1); toast.success("PIN изменён"); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const statusTitle = !installed
    ? "PIN не установлен"
    : unlocked ? `Разблокирован · ${fmtTime(secondsLeft)}` : "PIN установлен";
  const statusSub = !installed
    ? "Один PIN на все кошельки"
    : unlocked ? "Подписи без повторного ввода" : "Введи PIN для подписи транзакций";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          unlocked ? "bg-success/10 text-success" : installed ? "bg-amber-400/10 text-amber-400" : "bg-gold/10 text-gold"
        )}>
          <Shield className="h-4 w-4" />
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
                <button onClick={() => { lockMaster(); toast.success("Заблокировано"); }} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-destructive" title="Заблокировать сейчас">
                  Запереть
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {mode === "setup" && (
        <form onSubmit={(e) => { e.preventDefault(); doSetup(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PinInput value={pin1} onChange={setPin1} label="Новый PIN (мин 6)" />
          <PinInput value={pin2} onChange={setPin2} label="Повтори PIN" autoFocus={false} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || pin1.length < 6} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Установить"}
            </button>
          </div>
        </form>
      )}
      {mode === "unlock" && (
        <form onSubmit={(e) => { e.preventDefault(); doUnlock(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PinInput value={pin1} onChange={setPin1} label="Введи общий PIN" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || pin1.length < 1} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Разблокировать"}
            </button>
          </div>
        </form>
      )}
      {mode === "change" && (
        <form onSubmit={(e) => { e.preventDefault(); doChange(); }} className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3">
          <PinInput value={oldPin} onChange={setOldPin} label="Текущий PIN" />
          <PinInput value={pin1} onChange={setPin1} label="Новый PIN (мин 6)" autoFocus={false} />
          <PinInput value={pin2} onChange={setPin2} label="Повтори новый PIN" autoFocus={false} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
            <button type="submit" disabled={busy || pin1.length < 6} className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
              {busy ? "…" : "Сменить"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
