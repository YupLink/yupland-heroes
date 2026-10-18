import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  Shield,
  Copy,
  Check,
  Loader2,
  Trash2,
  Send,
  X,
  Settings,
} from "lucide-react";
import {
  removeEmbeddedWallet,
  saveWalletBackup,
  getWalletBackup,
  myWalletBalances,
} from "@/server/api/embedded";
import {
  removeLocalWallet,
  sendNear,
  sendFt,
  sendNft,
  hasPin,
  getSeedPhrase,
  importEmbeddedWalletBySeed,
} from "@/lib/embeddedWallet";
import {
  encryptSeed,
  decryptSeed,
  MIN_PASSWORD_LEN,
  type BackupBlob,
} from "@/lib/walletBackup";
import {
  hasMasterPin,
} from "@/lib/masterKey";
import { cn } from "@/lib/utils";
import { SeedReveal, PrivateKeyReveal, MasterPinPanel, AppLockPanel, PwdInput, PinInput } from "./WalletSecurity";
import { humanError } from "@/lib/humanError";

// ──────── Settings Sheet ────────

/**
 * Зашифрованный паролем бэкап сид-фразы на наш сервер. Шифрование/расшифровка —
 * только здесь, на клиенте (Argon2id + AES-256-GCM). На сервер уходит лишь
 * шифр-блоб; пароль и сид сервер не видит. Восстановление возвращает кош на это
 * устройство (важно после чистки webview).
 */
function WalletBackupPanel({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState<null | "backup" | "restore">(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [hasBackup, setHasBackup] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getWalletBackup({ data: { accountId } })
      .then((r) => alive && setHasBackup(!!r.blob))
      .catch(() => alive && setHasBackup(false));
    return () => {
      alive = false;
    };
  }, [accountId]);

  const toggle = (m: "backup" | "restore") => {
    setOpen(open === m ? null : m);
    setStatus(null);
    setPwd("");
  };

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (open === "backup") {
        if (pwd.length < MIN_PASSWORD_LEN) {
          throw new Error(`Пароль минимум ${MIN_PASSWORD_LEN} символов`);
        }
        const seed = await getSeedPhrase({ accountId });
        const blob = await encryptSeed(seed, pwd);
        await saveWalletBackup({ data: { accountId, blob } });
        setHasBackup(true);
        setStatus({ ok: true, text: "Зашифрованный бэкап сохранён на сервере" });
        setOpen(null);
        setPwd("");
      } else {
        const r = await getWalletBackup({ data: { accountId } });
        if (!r.blob) throw new Error("Бэкапа нет");
        const seed = await decryptSeed(r.blob as BackupBlob, pwd);
        await importEmbeddedWalletBySeed({ seedPhrase: seed, accountId });
        setStatus({ ok: true, text: "Кошелёк восстановлен на этом устройстве" });
        setOpen(null);
        setPwd("");
      }
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Shield className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Бэкап на сервер (по паролю)</span>
          <span className="block text-[11px] text-muted-foreground">
            {hasBackup === undefined
              ? "…"
              : hasBackup
                ? "Бэкап есть · восстановится по паролю на любом устройстве"
                : "Бэкапа нет — сделай, чтобы не потерять кош при чистке хранилища"}
          </span>
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => toggle("backup")}
          className="flex-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs transition hover:border-gold/40"
        >
          Сделать бэкап
        </button>
        <button
          onClick={() => toggle("restore")}
          disabled={!hasBackup}
          className="flex-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs transition hover:border-gold/40 disabled:opacity-40"
        >
          Восстановить по паролю
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder={open === "backup" ? "Придумай пароль бэкапа (мин. 8)" : "Пароль бэкапа"}
            className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            autoFocus
            autoComplete="off"
          />
          <button
            onClick={run}
            disabled={busy || !pwd}
            className="mt-2 w-full rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-black transition hover:bg-gold/90 disabled:opacity-40"
          >
            {busy ? "…" : open === "backup" ? "Зашифровать и сохранить" : "Восстановить"}
          </button>
        </div>
      )}
      {status && (
        <p className={cn("mt-2 text-[11px]", status.ok ? "text-success" : "text-destructive")}>
          {status.text}
        </p>
      )}
    </div>
  );
}

/**
 * Секция настроек: единый заголовок-капс + вертикальный стек строк.
 * Унифицирует отступы между всеми секциями шторки.
 */
function SettingsSection({
  title,
  danger = false,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4
        className={cn(
          "px-1 text-[11px] font-semibold uppercase tracking-wider",
          danger ? "text-destructive/80" : "text-muted-foreground"
        )}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Тонкая разделительная линия между секциями. */
function SettingsDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />;
}

export function WalletSettingsSheet({
  accountId,
  onClose,
  onRemoved,
}: {
  accountId: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyAccountId = () => {
    navigator.clipboard.writeText(accountId);
    setCopied(true);
    toast.success("Адрес скопирован");
    setTimeout(() => setCopied(false), 1600);
  };

  const removeMut = useMutation({
    mutationFn: async () => {
      if (
        !window.confirm(
          "Удалить кошелёк? Если не записал сид-фразу — восстановить не сможешь."
        )
      )
        throw new Error("отмена");
      await removeLocalWallet(accountId);
      // Серверная отвязка — best-effort. Удаление «только с этого устройства» не
      // должно падать из-за рассинхрона привязок ("это не твой кошелёк") или
      // осиротевшей записи: локальная запись с устройства уже снесена.
      try {
        await removeEmbeddedWallet({ data: { accountId } });
      } catch {
        /* привязка не совпала / уже не зарегистрирован — это ок для локального удаления */
      }
    },
    onSuccess: () => {
      toast.success("Удалён");
      onRemoved();
    },
    onError: (e: Error) => {
      if (e.message !== "отмена") toast.error(humanError(e));
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-5rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-card/95 shadow-card backdrop-blur-xl sm:max-h-[85vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Залипающая шапка: остаётся видимой при скролле, не лезет под
            фикс-шапку приложения благодаря max-h контейнера. */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/90 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20">
              <Settings className="h-4 w-4" />
            </span>
            <h3 className="font-display text-lg font-bold">Настройки</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Скроллируемое тело */}
        <div className="space-y-5 overflow-y-auto px-5 py-5">
          {/* ── Кошелёк ── */}
          <SettingsSection title="Кошелёк">
            <button
              onClick={copyAccountId}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-gold/40"
              title="Скопировать адрес"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                <WalletIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-muted-foreground">
                  Активный аккаунт
                </span>
                <span className="block break-all font-mono text-xs text-foreground">
                  {accountId}
                </span>
              </span>
              {copied ? (
                <Check className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Copy className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-gold" />
              )}
            </button>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Безопасность ── */}
          <SettingsSection title="Безопасность">
            <AppLockPanel />
            {/* Легаси общий PIN — показываем только если он уже установлен у
                юзера; новым пользователям достаточно пароля кошелька выше. */}
            {hasMasterPin() && <MasterPinPanel />}
            <SeedReveal accountId={accountId} />
            <PrivateKeyReveal accountId={accountId} />
            <WalletBackupPanel accountId={accountId} />
          </SettingsSection>

          <SettingsDivider />

          {/* ── Опасная зона ── */}
          <SettingsSection title="Опасная зона" danger>
            <button
              onClick={() => removeMut.mutate()}
              className="flex w-full items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-left transition hover:bg-destructive/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-destructive">
                  Удалить кошелёк
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Только с этого устройства · вернётся по сид-фразе
                </span>
              </span>
            </button>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

// ──────── Send Modal ────────

export type SendTarget =
  | { kind: "near"; nearYocto: string; lazy?: boolean }
  | {
      kind: "ft";
      ftContract: string;
      symbol: string;
      decimals: number;
      balance: string;
    }
  | { kind: "nft"; nftContract: string; tokenId: string; title: string };

// Резерв на gas + storage для NEAR transfer (~0.05 NEAR с запасом)
const NEAR_GAS_RESERVE_YOCTO = 50_000_000_000_000_000_000_000n; // 0.05 NEAR

function humanizeError(msg: string): string {
  // Парсим типичные NEAR RPC ошибки в понятные
  if (msg.includes("NotEnoughBalance"))
    return "Недостаточно NEAR на кошельке (нужен ещё на газ ~0.05 NEAR)";
  if (msg.includes("InsufficientGas"))
    return "Недостаточно газа на TX";
  if (msg.includes("LackBalanceForState"))
    return "Не хватает баланса на storage stake";
  if (msg.includes("AccountDoesNotExist"))
    return "Получатель не существует в сети NEAR";
  if (msg.includes("Неверный PIN")) return "Неверный PIN";
  return msg;
}

function formatYoctoStr(yocto: string, decimals: number): string {
  try {
    const n = BigInt(yocto);
    const div = 10n ** BigInt(decimals);
    const whole = n / div;
    const frac = n % div;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`.replace(/\.?0+$/, "");
  } catch {
    return yocto;
  }
}

export function SendModal({
  accountId,
  target,
  onClose,
  onSuccess,
}: {
  accountId: string;
  target: SendTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "preview" | "sending">("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [pinNeeded, setPinNeeded] = useState(false);

  // Для hero-«Отправить» (kind=near, lazy) подтягиваем актуальный баланс,
  // чтобы корректно посчитать MAX. Тот же query-ключ — дедуплицируется.
  const lazyBal = useQuery({
    queryKey: ["my", "wallet", accountId, "balances"],
    queryFn: () => myWalletBalances({ data: { accountId } }),
    enabled: target.kind === "near" && !!target.lazy,
    staleTime: 30_000,
  });

  useEffect(() => {
    hasPin(accountId).then(setPinNeeded).catch(() => setPinNeeded(false));
  }, [accountId]);

  const symbol =
    target.kind === "near"
      ? "NEAR"
      : target.kind === "ft"
        ? target.symbol
        : "";

  // Для lazy-near берём актуальный баланс из запроса.
  const nearYoctoForMax =
    target.kind === "near"
      ? target.lazy
        ? lazyBal.data?.nearYocto ?? "0"
        : target.nearYocto
      : "0";

  const maxAvailable = (() => {
    if (target.kind === "near") {
      const total = BigInt(nearYoctoForMax);
      const free = total > NEAR_GAS_RESERVE_YOCTO ? total - NEAR_GAS_RESERVE_YOCTO : 0n;
      return formatYoctoStr(free.toString(), 24);
    }
    if (target.kind === "ft") {
      return formatYoctoStr(target.balance, target.decimals);
    }
    return "";
  })();

  const mut = useMutation({
    mutationFn: async () => {
      if (!recipient.trim()) throw new Error("Введи адрес получателя");
      if (pinNeeded && !pin) throw new Error("Введи PIN");
      if (target.kind === "near") {
        if (!amount) throw new Error("Введи сумму");
        return sendNear({
          accountId,
          pin: pin || undefined,
          recipient: recipient.trim(),
          amountNear: amount,
        });
      }
      if (target.kind === "ft") {
        if (!amount) throw new Error("Введи сумму");
        return sendFt({
          accountId,
          pin: pin || undefined,
          ftContract: target.ftContract,
          decimals: target.decimals,
          recipient: recipient.trim(),
          amount,
        });
      }
      return sendNft({
        accountId,
        pin: pin || undefined,
        nftContract: target.nftContract,
        tokenId: target.tokenId,
        recipient: recipient.trim(),
      });
    },
    onSuccess: (res) => {
      toast.success(`Отправлено! tx: ${res.txHash.slice(0, 12)}…`);
      onSuccess();
    },
    onError: (e: Error) => {
      setStep("form");
      toast.error(humanizeError(e.message));
    },
  });

  const what =
    target.kind === "near"
      ? "NEAR"
      : target.kind === "ft"
        ? target.symbol
        : `NFT «${target.title}»`;

  function goToPreview() {
    if (!recipient.trim()) {
      toast.error("Введи адрес получателя");
      return;
    }
    if (target.kind !== "nft" && !amount.trim()) {
      toast.error("Введи сумму");
      return;
    }
    if (pinNeeded && !pin) {
      toast.error("Введи PIN");
      return;
    }
    setStep("preview");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold">
            {step === "preview" ? "Подтверди отправку" : `Отправить ${what}`}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-secondary p-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {step === "form" && (
          <>
            <label className="block">
              <div className="mb-1 text-xs text-muted-foreground">Получатель</div>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="example.near"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
                autoFocus
              />
            </label>

            {target.kind !== "nft" && (
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Сумма ({symbol})</span>
                  <button
                    type="button"
                    onClick={() => setAmount(maxAvailable)}
                    className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] text-gold"
                  >
                    MAX: {maxAvailable}
                  </button>
                </div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.5"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
                />
                {target.kind === "near" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    MAX = весь баланс минус ~0.05 NEAR резерв на газ/storage
                  </div>
                )}
              </label>
            )}

            {pinNeeded && <PinInput value={pin} onChange={setPin} label="PIN" />}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-border bg-card px-3 py-2 text-xs"
              >
                Отмена
              </button>
              <button
                onClick={goToPreview}
                className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground"
              >
                Далее →
              </button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Что:</span>
                <span className="font-bold">{what}</span>
              </div>
              {target.kind !== "nft" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Сумма:</span>
                  <span className="font-mono text-gradient-gold text-sm font-bold">
                    {amount} {symbol}
                  </span>
                </div>
              )}
              {target.kind === "nft" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Token ID:</span>
                  <span className="font-mono text-[10px]">{target.tokenId}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Откуда:</span>
                <span className="truncate font-mono text-[10px]">{accountId}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Кому:</span>
                <span className="truncate font-mono text-[10px]">
                  {recipient.trim()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gold/20 pt-2">
                <span className="text-muted-foreground">Газ (комиссия):</span>
                <span className="font-mono">~0.001 NEAR (твоя)</span>
              </div>
              {target.kind === "ft" && (
                <div className="text-[10px] text-muted-foreground">
                  Если получатель ещё не зарегистрирован на контракте токена —
                  добавится storage_deposit ~0.00125 NEAR (одноразово, твой)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStep("form")}
                className="rounded-full border border-border bg-card px-3 py-2 text-xs"
              >
                ← Изменить
              </button>
              <button
                disabled={mut.isPending}
                onClick={() => mut.mutate()}
                className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
              >
                {mut.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Отправляю…
                  </>
                ) : (
                  "Подтвердить"
                )}
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Подпись делается у тебя в браузере, ключ не уходит на сервер.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
