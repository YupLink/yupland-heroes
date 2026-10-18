import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ChevronDown,
  Lock,
} from "lucide-react";
import {
  getSeedPhrase,
  getKeyPairBytes,
  getBlobKind,
  isKeyOnly,
} from "@/lib/embeddedWallet";
import {
  hasMasterPin,
  isMasterUnlocked,
  setupMasterPin,
  unlockMaster,
  lockMaster,
  changeMasterPin,
  masterUnlockSecondsLeft,
} from "@/lib/masterKey";
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
  APPLOCK_NEVER,
} from "@/lib/appLock";
import { SeedRevealSlider } from "@/components/SeedRevealSlider";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

// ──────── Утилиты ввода ────────

/** Поле пароля (буквы/цифры, не numeric) с переключателем показа. */
export function PwdInput({
  value,
  onChange,
  label = "Пароль",
  autoFocus = true,
  placeholder = "••••••••",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="block text-left">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10"
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

export function PinInput({
  value,
  onChange,
  label = "PIN",
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="block">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono"
          placeholder="••••••"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

// ──────── Seed Reveal ────────

/**
 * Показ сид-фразы. Тот же PIN-флоу что раньше (per-account / master),
 * через getSeedPhrase + SeedRevealSlider. Стейт затирается при закрытии.
 */
export function SeedReveal({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [keyOnly, setKeyOnly] = useState(false);
  const [appPwd, setAppPwd] = useState("");
  const [blobKind, setBlobKind] = useState<
    "plain" | "per-account-pin" | "master-pin" | null
  >(null);

  // Определяем тип кошелька: для key-only сида нет — кнопка дисейблится.
  useEffect(() => {
    isKeyOnly(accountId).then(setKeyOnly);
  }, [accountId]);

  useEffect(() => {
    if (open && !revealed) {
      getBlobKind(accountId).then((k) => {
        setBlobKind(k);
        const needsPin =
          k === "per-account-pin" ||
          (k === "master-pin" && !isMasterUnlocked());
        setPinNeeded(needsPin);
      });
    }
  }, [open, accountId, revealed]);

  const revealMut = useMutation({
    mutationFn: async () => {
      // Пароль кошелька (app-lock) — показ сид-фразы спрашивает его ВСЕГДА.
      if (hasAppPassword()) {
        if (!appPwd) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd); // верный пароль показывает и освежает сессию
      }
      if (blobKind === "master-pin" && !isMasterUnlocked()) {
        if (!pin) throw new Error("PIN_REQUIRED");
        await unlockMaster(pin);
      }
      return getSeedPhrase({ accountId, pin: pin || undefined });
    },
    onSuccess: (s) => {
      setRevealed(s);
      setPin("");
      setAppPwd("");
    },
    onError: (e: Error) => {
      if (e.message === "PIN_REQUIRED") {
        setPinNeeded(true);
        toast.info("Введи PIN");
      } else if (e.message === "APP_PWD_REQUIRED" || e.message === "APP_LOCKED") {
        toast.info("Введи пароль кошелька");
      } else toast.error(humanError(e));
    },
  });

  const close = () => {
    setRevealed(null); // затираем сид из стейта
    setPin("");
    setAppPwd("");
    setOpen(false);
  };

  // key-only кошелёк: показать сид-фразу нельзя — её нет. Дисейбл с подписью.
  // (Размещаем ПОСЛЕ всех хуков, чтобы не нарушать правила хуков React.)
  if (keyOnly) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-3 opacity-70">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
          <EyeOff className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-muted-foreground">
            Сид-фраза недоступна
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Импортирован по приватному ключу — сид-фразы нет
          </span>
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-gold/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Eye className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Показать сид-фразу</span>
          <span className="block text-[11px] text-muted-foreground">
            12 слов для восстановления кошелька
          </span>
        </span>
        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
      </button>
    );
  }

  if (revealed) {
    return (
      <div className="space-y-2.5 rounded-xl border border-warning/40 bg-warning/[0.06] p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div className="pt-0.5">
            <div className="text-[12px] font-bold text-warning">
              Никому не передавай сид-фразу
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-warning/80">
              Кто узнает — заберёт все деньги. Поддержка её не спрашивает.
            </div>
          </div>
        </div>
        <SeedRevealSlider seed={revealed} onBack={close} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        revealMut.mutate();
      }}
      className="space-y-2 rounded-xl border border-border bg-card p-3"
    >
      <div className="text-xs font-semibold">Показать сид-фразу</div>
      {hasAppPassword() && (
        <PwdInput value={appPwd} onChange={setAppPwd} label="Пароль кошелька" />
      )}
      {pinNeeded && <PinInput value={pin} onChange={setPin} label="PIN" />}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={revealMut.isPending}
          className="flex items-center justify-center gap-1 rounded-lg gradient-gold px-2 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {revealMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
          Показать
        </button>
      </div>
    </form>
  );
}

// ──────── Private Key Reveal ────────

/**
 * НОВОЕ: показ приватного ключа (ed25519:...). По аналогии с показом сида:
 * тот же PIN-флоу (через getKeyPairBytes → getSeedPhrase внутри), показ
 * через SeedRevealSlider (slider→скрыто→копировать), предупреждение про
 * приватник. Реальное значение в логи не уходит, стейт затирается при
 * закрытии.
 */
export function PrivateKeyReveal({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState("");
  const [privKey, setPrivKey] = useState<string | null>(null);
  const [appPwd, setAppPwd] = useState("");
  const [blobKind, setBlobKind] = useState<
    "plain" | "per-account-pin" | "master-pin" | null
  >(null);

  useEffect(() => {
    if (open && !privKey) {
      getBlobKind(accountId).then((k) => {
        setBlobKind(k);
        const needsPin =
          k === "per-account-pin" ||
          (k === "master-pin" && !isMasterUnlocked());
        setPinNeeded(needsPin);
      });
    }
  }, [open, accountId, privKey]);

  const revealMut = useMutation({
    mutationFn: async () => {
      // Пароль кошелька (app-lock) — показ приватного ключа спрашивает его ВСЕГДА.
      if (hasAppPassword()) {
        if (!appPwd) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd); // верный пароль показывает и освежает сессию
      }
      if (blobKind === "master-pin" && !isMasterUnlocked()) {
        if (!pin) throw new Error("PIN_REQUIRED");
        await unlockMaster(pin);
      }
      const kp = await getKeyPairBytes({ accountId, pin: pin || undefined });
      return kp.secretKeyStr;
    },
    onSuccess: (s) => {
      setPrivKey(s);
      setPin("");
      setAppPwd("");
    },
    onError: (e: Error) => {
      if (e.message === "PIN_REQUIRED") {
        setPinNeeded(true);
        toast.info("Введи PIN");
      } else if (e.message === "APP_PWD_REQUIRED" || e.message === "APP_LOCKED") {
        toast.info("Введи пароль кошелька");
      } else toast.error(humanError(e));
    },
  });

  const close = () => {
    setPrivKey(null); // затираем приватник из стейта
    setPin("");
    setAppPwd("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-gold/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <KeyRound className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">
            Показать приватный ключ
          </span>
          <span className="block text-[11px] text-muted-foreground">
            ed25519-ключ для импорта в другие кошельки
          </span>
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
            <div className="text-[12px] font-bold text-warning">
              Никому не передавай приватный ключ
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-warning/80">
              Кто узнает ключ — получит полный доступ к кошельку и заберёт все
              деньги. Поддержка его не спрашивает.
            </div>
          </div>
        </div>
        <SeedRevealSlider seed={privKey} onBack={close} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        revealMut.mutate();
      }}
      className="space-y-2 rounded-xl border border-border bg-card p-3"
    >
      <div className="text-xs font-semibold">Показать приватный ключ</div>
      {hasAppPassword() && (
        <PwdInput value={appPwd} onChange={setAppPwd} label="Пароль кошелька" />
      )}
      {pinNeeded && <PinInput value={pin} onChange={setPin} label="PIN" />}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={revealMut.isPending}
          className="flex items-center justify-center gap-1 rounded-lg gradient-gold px-2 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {revealMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
          Показать
        </button>
      </div>
    </form>
  );
}

// ──────── Master PIN Panel ────────

/**
 * Master-PIN панель: один PIN на ВСЕ embedded-кошельки. После ввода
 * расшифрованный master-key живёт в памяти 5 минут — multi-wallet операции
 * не требуют повторного ввода.
 *
 * Состояния:
 *  - master не установлен → "Защитить все кошельки общим PIN'ом" (setup)
 *  - master установлен, заблокирован → "Разблокировать" (unlock)
 *  - master установлен, разблокирован → "Заблокировано через X мин" + "Сменить" / "Заблокировать сейчас"
 */
export function MasterPinPanel() {
  const [, force] = useState(0);
  const [mode, setMode] = useState<"idle" | "setup" | "unlock" | "change">(
    "idle"
  );
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Live-таймер: каждую секунду обновляем UI с оставшимся временем.
  useEffect(() => {
    const tick = () => {
      const left = masterUnlockSecondsLeft();
      setSecondsLeft(left);
      // Перерисовать чтобы обновился hasMasterPin / isMasterUnlocked
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
    if (pin1 !== pin2) {
      toast.error("PIN'ы не совпадают");
      return;
    }
    setBusy(true);
    try {
      await setupMasterPin(pin1);
      toast.success("Общий PIN установлен");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doUnlock = async () => {
    setBusy(true);
    try {
      await unlockMaster(pin1);
      toast.success("Кошелёк разблокирован на 5 минут");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doChange = async () => {
    if (pin1 !== pin2) {
      toast.error("Новые PIN'ы не совпадают");
      return;
    }
    setBusy(true);
    try {
      await changeMasterPin(oldPin, pin1);
      toast.success("PIN изменён");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  // Статус-строка: иконка-щит + заголовок + подпись + одна понятная кнопка.
  const statusTitle = !installed
    ? "PIN не установлен"
    : unlocked
      ? `Разблокирован · ${fmtTime(secondsLeft)}`
      : "PIN установлен";
  const statusSub = !installed
    ? "Один PIN на все кошельки"
    : unlocked
      ? "Подписи без повторного ввода"
      : "Введи PIN для подписи транзакций";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            unlocked
              ? "bg-success/10 text-success"
              : installed
                ? "bg-amber-400/10 text-amber-400"
                : "bg-gold/10 text-gold"
          )}
        >
          <Shield className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{statusTitle}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {statusSub}
          </div>
        </div>

        {/* Одна понятная кнопка действия */}
        {mode === "idle" && (
          <>
            {!installed && (
              <button
                onClick={() => setMode("setup")}
                className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/15"
              >
                Установить
              </button>
            )}
            {installed && !unlocked && (
              <button
                onClick={() => setMode("unlock")}
                className="shrink-0 rounded-full border border-success/40 bg-success/10 px-3.5 py-1.5 text-[11px] font-semibold text-success transition hover:bg-success/15"
              >
                Разблокировать
              </button>
            )}
            {installed && unlocked && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setMode("change")}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                  title="Сменить PIN"
                >
                  Сменить
                </button>
                <button
                  onClick={() => {
                    lockMaster();
                    toast.success("Заблокировано");
                  }}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-destructive"
                  title="Заблокировать сейчас"
                >
                  Запереть
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Формы режимов — аккуратно разворачиваются внутри блока */}
      {mode === "setup" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSetup();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PinInput value={pin1} onChange={setPin1} label="Новый PIN (мин 6)" />
          <PinInput
            value={pin2}
            onChange={setPin2}
            label="Повтори PIN"
            autoFocus={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || pin1.length < 6}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Установить"}
            </button>
          </div>
        </form>
      )}

      {mode === "unlock" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doUnlock();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PinInput value={pin1} onChange={setPin1} label="Введи общий PIN" />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || pin1.length < 1}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Разблокировать"}
            </button>
          </div>
        </form>
      )}

      {mode === "change" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doChange();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PinInput value={oldPin} onChange={setOldPin} label="Текущий PIN" />
          <PinInput
            value={pin1}
            onChange={setPin1}
            label="Новый PIN (мин 6)"
            autoFocus={false}
          />
          <PinInput
            value={pin2}
            onChange={setPin2}
            label="Повтори новый PIN"
            autoFocus={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || pin1.length < 6}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Сменить"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ──────── App Lock Panel ────────

const AUTOLOCK_OPTIONS: { ms: number; label: string }[] = [
  { ms: 5 * 60_000, label: "5 минут" },
  { ms: 15 * 60_000, label: "15 минут" },
  { ms: 60 * 60_000, label: "1 час" },
  { ms: 4 * 60 * 60_000, label: "4 часа" },
  { ms: APPLOCK_NEVER, label: "Никогда" },
];

function fmtLockLeft(s: number): string {
  if (!isFinite(s)) return "∞";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} ч ${m % 60} мин`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Пароль кошелька (app-lock): замок на ВХОД в раздел, показ сид/ключа и подпись
 * dApp-транзакций. Пароль не шифрует рабочий ключ — это внутренний замок
 * приложения. Забыл — кош возвращается по сид-фразе/серверному бэкапу.
 * Авто-лок настраивается отдельным пунктом (дефолт 1 час, есть «Никогда»).
 */
export function AppLockPanel() {
  const [, force] = useState(0);
  const [mode, setMode] = useState<
    "idle" | "setup" | "unlock" | "change" | "remove"
  >("idle");
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

  const reset = () => {
    setP1("");
    setP2("");
    setOldp("");
    setMode("idle");
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
    : unlocked
      ? `Разблокировано · ${fmtLockLeft(secondsLeft)}`
      : "Заблокировано";
  const statusSub = !installed
    ? "Замок на вход и показ ключа"
    : unlocked
      ? "Авто-лок по таймеру бездействия"
      : "Введи пароль, чтобы открыть кошелёк";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            installed && unlocked
              ? "bg-success/10 text-success"
              : installed
                ? "bg-amber-400/10 text-amber-400"
                : "bg-gold/10 text-gold"
          )}
        >
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{statusTitle}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {statusSub}
          </div>
        </div>

        {mode === "idle" && (
          <>
            {!installed && (
              <button
                onClick={() => setMode("setup")}
                className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/15"
              >
                Установить
              </button>
            )}
            {installed && !unlocked && (
              <button
                onClick={() => setMode("unlock")}
                className="shrink-0 rounded-full border border-success/40 bg-success/10 px-3.5 py-1.5 text-[11px] font-semibold text-success transition hover:bg-success/15"
              >
                Разблокировать
              </button>
            )}
            {installed && unlocked && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setMode("change")}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Сменить
                </button>
                <button
                  onClick={() => {
                    lockApp();
                    toast.success("Заблокировано");
                  }}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-destructive"
                  title="Заблокировать сейчас"
                >
                  Запереть
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Настройка авто-лока — отдельный пункт, виден когда пароль установлен */}
      {installed && mode === "idle" && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            Спрашивать пароль после простоя
          </span>
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
              <option key={o.ms} value={String(o.ms)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "setup" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSetup();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PwdInput value={p1} onChange={setP1} label="Новый пароль (мин 8)" />
          <PwdInput
            value={p2}
            onChange={setP2}
            label="Повтори пароль"
            autoFocus={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || p1.length < 8}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Установить"}
            </button>
          </div>
        </form>
      )}

      {mode === "unlock" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doUnlock();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PwdInput value={p1} onChange={setP1} label="Пароль кошелька" />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || p1.length < 1}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Разблокировать"}
            </button>
          </div>
        </form>
      )}

      {mode === "change" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doChange();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <PwdInput value={oldp} onChange={setOldp} label="Текущий пароль" />
          <PwdInput
            value={p1}
            onChange={setP1}
            label="Новый пароль (мин 8)"
            autoFocus={false}
          />
          <PwdInput
            value={p2}
            onChange={setP2}
            label="Повтори новый пароль"
            autoFocus={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("remove")}
              className="rounded-full border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              Снять пароль
            </button>
            <button
              type="submit"
              disabled={busy || p1.length < 8}
              className="rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Сменить"}
            </button>
          </div>
        </form>
      )}

      {mode === "remove" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doRemove();
          }}
          className="space-y-2 border-t border-border/60 px-3 pb-3 pt-3"
        >
          <div className="text-[11px] text-muted-foreground">
            Снять пароль — вход и показ ключа снова без пароля. Подтверди текущим
            паролем.
          </div>
          <PwdInput value={oldp} onChange={setOldp} label="Текущий пароль" />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || oldp.length < 1}
              className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50"
            >
              {busy ? "…" : "Снять пароль"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
