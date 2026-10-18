import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, ChevronDown, AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { getKeyPairBytes, getBlobKind } from "@/lib/embeddedWallet";
import { hasAppPassword, unlockApp } from "@/lib/appLock";
import { hasMasterPin, isMasterUnlocked, unlockMaster } from "@/lib/masterKey";
import { SeedRevealSlider } from "@/components/SeedRevealSlider";
import { PwdInput, PinInput } from "./inputs";
import { humanError } from "@/lib/humanError";

export function PrivateKeyReveal({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState("");
  const [privKey, setPrivKey] = useState<string | null>(null);
  const [appPwd, setAppPwd] = useState("");
  const [blobKind, setBlobKind] = useState<"plain" | "per-account-pin" | "master-pin" | null>(null);

  useEffect(() => {
    if (open && !privKey) {
      getBlobKind(accountId).then((k) => {
        setBlobKind(k);
        const needsPin = k === "per-account-pin" || (k === "master-pin" && !isMasterUnlocked());
        setPinNeeded(needsPin);
      });
    }
  }, [open, accountId, privKey]);

  const revealMut = useMutation({
    mutationFn: async () => {
      if (hasAppPassword()) {
        if (!appPwd) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd);
      }
      if (blobKind === "master-pin" && !isMasterUnlocked()) {
        if (!pin) throw new Error("PIN_REQUIRED");
        await unlockMaster(pin);
      }
      const kp = await getKeyPairBytes({ accountId, pin: pin || undefined });
      return kp.secretKeyStr;
    },
    onSuccess: (s) => { setPrivKey(s); setPin(""); setAppPwd(""); },
    onError: (e: Error) => {
      if (e.message === "PIN_REQUIRED") { setPinNeeded(true); toast.info("Введи PIN"); }
      else if (e.message === "APP_PWD_REQUIRED" || e.message === "APP_LOCKED") { toast.info("Введи пароль кошелька"); }
      else toast.error(humanError(e));
    },
  });

  const close = () => { setPrivKey(null); setPin(""); setAppPwd(""); setOpen(false); };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-gold/40">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <KeyRound className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Показать приватный ключ</span>
          <span className="block text-[11px] text-muted-foreground">ed25519-ключ для импорта в другие кошельки</span>
        </span>
        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
      </button>
    );
  }

  if (privKey) {
    return (
      <div className="space-y-2.5 rounded-xl border border-warning/40 bg-warning/[0.06] p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div className="pt-0.5">
            <div className="text-[12px] font-bold text-warning">Никому не передавай приватный ключ</div>
            <div className="mt-0.5 text-[10px] leading-snug text-warning/80">Кто узнает ключ — получит полный доступ к кошельку и заберёт все деньги. Поддержка его не спрашивает.</div>
          </div>
        </div>
        <SeedRevealSlider seed={privKey} onBack={close} />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); revealMut.mutate(); }} className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-semibold">Показать приватный ключ</div>
      {hasAppPassword() && <PwdInput value={appPwd} onChange={setAppPwd} label="Пароль кошелька" />}
      {pinNeeded && <PinInput value={pin} onChange={setPin} label="PIN" />}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={close} className="rounded-lg border border-border bg-card px-2 py-2 text-xs">Отмена</button>
        <button type="submit" disabled={revealMut.isPending} className="flex items-center justify-center gap-1 rounded-lg gradient-gold px-2 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
          {revealMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
          Показать
        </button>
      </div>
    </form>
  );
}
