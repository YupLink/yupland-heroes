import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KeyRound,
  Shield,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  registerEmbeddedWallet,
} from "@/server/api/embedded";
import {
  createEmbeddedWallet,
  importEmbeddedWalletBySeed,
  importEmbeddedWalletByPrivateKey,
  derivePublicFromPrivateKey,
} from "@/lib/embeddedWallet";
import {
  hasMasterPin,
} from "@/lib/masterKey";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

// ── Детект типа ввода для умного импорта ──
type DetectedInput =
  | { kind: "seed"; seed: string }
  | { kind: "key"; key: string }
  | { kind: "empty" }
  | { kind: "unknown" };

// Классификация без сетевых вызовов. Сид: ≥12 слов, валидных по BIP39. Ключ:
// ed25519:<base58> / base58 / hex подходящей длины (32 или 64 байта).
async function detectImportInput(raw: string): Promise<DetectedInput> {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  // Похоже на сид-фразу? (≥12 «слов» через пробелы)
  const words = trimmed.split(/\s+/);
  if (words.length >= 12) {
    const { validateMnemonic } = await import("@scure/bip39");
    const { wordlist } = await import("@scure/bip39/wordlists/english.js");
    if (validateMnemonic(trimmed.toLowerCase(), wordlist)) {
      return { kind: "seed", seed: trimmed.toLowerCase() };
    }
    // ≥12 слов, но не валидный BIP39 → точно не ключ.
    return { kind: "unknown" };
  }

  // Иначе пробуем как приватный ключ.
  let body = trimmed;
  if (body.startsWith("ed25519:")) body = body.slice("ed25519:".length).trim();
  // hex 64/128 символов
  if (/^[0-9a-fA-F]+$/.test(body) && (body.length === 64 || body.length === 128)) {
    return { kind: "key", key: trimmed };
  }
  // base58 → пробуем декодировать, ждём 32 или 64 байта
  try {
    const { base58 } = await import("@scure/base");
    const bytes = base58.decode(body);
    if (bytes.length === 32 || bytes.length === 64) {
      return { kind: "key", key: trimmed };
    }
  } catch {
    /* not base58 */
  }
  return { kind: "unknown" };
}

/**
 * Обязательная фиксация сид-фразы при создании коша: показываем сид → юзер
 * записывает → СКРЫВАЕМ → просим ввести 2 случайных слова. «Готово» доступно
 * только при верном вводе. Гарантия, что сид реально записан — иначе при
 * вытеснении IndexedDB (Telegram-webview и т.п.) кош не вернуть.
 */
export function SeedSaveGate({
  seedPhrase,
  onDone,
}: {
  seedPhrase: string;
  onDone: () => void;
}) {
  const words = seedPhrase.trim().split(/\s+/);
  const [step, setStep] = useState<"show" | "verify">("show");
  // 2 различные случайные позиции для проверки. Считаем в useEffect (клиент),
  // а НЕ в инициализаторе useState — иначе Math.random разойдётся между SSR и
  // гидрацией. Плейсхолдер [0,1] до клиента (шаг verify юзер открывает позже).
  const [ask, setAsk] = useState<number[]>([0, 1]);
  useEffect(() => {
    const idx = words.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setAsk(idx.slice(0, 2).sort((a, b) => a - b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const ok =
    a1.trim().toLowerCase() === (words[ask[0]] ?? " ") &&
    a2.trim().toLowerCase() === (words[ask[1]] ?? " ");

  if (step === "show") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" /> Запиши сид-фразу
          </div>
          <p className="mt-1 text-xs">
            Единственный способ восстановить кошелёк, если потеряешь устройство
            или браузер очистит хранилище. Показываем один раз.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm sm:grid-cols-3">
            {words.map((w, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="w-5 text-right text-muted-foreground">
                  {i + 1}.
                </span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(seedPhrase);
            toast.success("Скопировано");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          <Copy className="h-3 w-3" /> Скопировать
        </button>
        <button
          onClick={() => setStep("verify")}
          className="w-full rounded-full gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground"
        >
          Я записал — продолжить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-semibold">Подтверди, что записал</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Сид скрыт. Введи слова под номерами {ask[0] + 1} и {ask[1] + 1} из своей
          записи.
        </p>
        <div className="mt-3 space-y-2">
          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">
              Слово №{ask[0] + 1}
            </div>
            <input
              value={a1}
              onChange={(e) => setA1(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono"
              placeholder="…"
              autoFocus
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">
              Слово №{ask[1] + 1}
            </div>
            <input
              value={a2}
              onChange={(e) => setA2(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono"
              placeholder="…"
            />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setA1("");
            setA2("");
            setStep("show");
          }}
          className="rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          ← Показать сид снова
        </button>
        <button
          disabled={!ok}
          onClick={onDone}
          className="rounded-full gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          Готово
        </button>
      </div>
    </div>
  );
}

export function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [created, setCreated] = useState<{
    accountId: string;
    seedPhrase: string;
  } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const w = await createEmbeddedWallet();
      await registerEmbeddedWallet({
        data: { accountId: w.accountId, publicKey: w.publicKey },
      });
      return w;
    },
    onSuccess: (w) =>
      setCreated({ accountId: w.accountId, seedPhrase: w.seedPhrase }),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (created) {
    return (
      <SeedSaveGate
        seedPhrase={created.seedPhrase}
        onDone={() => onDone(created.accountId)}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="space-y-3"
    >
      <p className="text-xs text-muted-foreground">
        Сгенерируем NEAR-аккаунт в браузере. Ключ останется только на этом
        устройстве.
      </p>
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success">
        <Shield className="mr-1 inline h-3 w-3" />
        Ключ ляжет в защищённое хранилище браузера — скопировать его с
        устройства нельзя. PIN не нужен.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={mut.isPending}
          className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Создать
        </button>
      </div>
    </form>
  );
}

/**
 * Умный импорт: ОДНО поле — вставь СИД-фразу ИЛИ ПРИВАТНЫЙ КЛЮЧ, тип
 * определяется автоматически. Account ID НЕ вводится руками — после вставки
 * деривируем public key, ищем named-аккаунт (FastNear) и показываем найденный
 * accountId read-only. Кнопка «Добавить» сохраняет кошелёк нужным путём
 * (seed → secureWallet seed-путь; key → key-only secureWallet).
 */
export function ImportForm({
  onDone,
  onCancel,
}: {
  onDone: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  // Результат детекта + дискавери аккаунта
  const [detected, setDetected] = useState<DetectedInput>({ kind: "empty" });
  const [resolving, setResolving] = useState(false);
  const [resolvedAccount, setResolvedAccount] = useState<string | null>(null);
  const [isNamed, setIsNamed] = useState(false);
  const [fullAccess, setFullAccess] = useState(true);
  const [detectErr, setDetectErr] = useState<string | null>(null);

  // Дебаунс-детект + дискавери. Каждый прогон отменяет предыдущий.
  useEffect(() => {
    let cancelled = false;
    setResolvedAccount(null);
    setDetectErr(null);
    const raw = value;
    if (!raw.trim()) {
      setDetected({ kind: "empty" });
      setResolving(false);
      return;
    }
    const t = setTimeout(async () => {
      setResolving(true);
      try {
        const det = await detectImportInput(raw);
        if (cancelled) return;
        setDetected(det);
        if (det.kind === "unknown") {
          setDetectErr("Не похоже на сид-фразу или приватный ключ");
          return;
        }
        if (det.kind === "empty") return;

        // Деривируем public key + implicit, ищем named-аккаунт.
        let publicKeyStr: string;
        let implicitId: string;
        if (det.kind === "seed") {
          const { deriveRawKeyFromSeedPhrase } = await import(
            "@/lib/embeddedWallet"
          );
          const r = await deriveRawKeyFromSeedPhrase(det.seed);
          publicKeyStr = r.publicKeyStr;
          implicitId = r.accountId;
        } else {
          const r = await derivePublicFromPrivateKey(det.key);
          publicKeyStr = r.publicKeyStr;
          implicitId = r.accountId;
        }
        if (cancelled) return;

        // Дискавери named-аккаунта по public key.
        try {
          const { lookupAccountsByPublicKey } = await import(
            "@/server/api/embedded"
          );
          const res = await lookupAccountsByPublicKey({
            data: { publicKey: publicKeyStr },
          });
          if (cancelled) return;
          const named = (res.accountIds ?? []).filter(
            (id) => id.length !== 64 || !/^[0-9a-f]+$/i.test(id)
          );
          if (named.length > 0) {
            setResolvedAccount(named[0]);
            setIsNamed(true);
            setFullAccess(res.hasFullAccess ?? false);
          } else {
            setResolvedAccount(implicitId);
            setIsNamed(false);
            setFullAccess(true);
          }
        } catch {
          if (cancelled) return;
          // Сеть недоступна — используем implicit как fallback.
          setResolvedAccount(implicitId);
          setIsNamed(false);
          setFullAccess(true);
        }
      } catch (e) {
        if (!cancelled)
          setDetectErr(
            e instanceof Error ? e.message : "Ошибка разбора ввода"
          );
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  const mut = useMutation({
    mutationFn: async () => {
      const det = await detectImportInput(value);
      let w: { accountId: string; publicKey: string };
      if (det.kind === "seed") {
        w = await importEmbeddedWalletBySeed({
          seedPhrase: det.seed,
          accountId: resolvedAccount || undefined,
        });
      } else if (det.kind === "key") {
        w = await importEmbeddedWalletByPrivateKey({
          privateKeyStr: det.key,
          accountId: resolvedAccount || undefined,
        });
      } else {
        throw new Error("Не похоже на сид-фразу или приватный ключ");
      }
      await registerEmbeddedWallet({
        data: { accountId: w.accountId, publicKey: w.publicKey },
      });
      return w;
    },
    onSuccess: (w) => {
      toast.success("Импортирован");
      setValue(""); // затираем ввод (сид/ключ) из стейта
      onDone(w.accountId);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const canSubmit =
    (detected.kind === "seed" || detected.kind === "key") &&
    !!resolvedAccount &&
    !resolving &&
    !mut.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) mut.mutate();
      }}
      className="space-y-3"
    >
      <label className="block">
        <div className="mb-1 text-xs text-muted-foreground">
          Сид-фраза или приватный ключ
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          autoFocus
          placeholder="12/24 слова через пробел — или ed25519:… приватный ключ"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          Определим автоматически. Аккаунт подставится сам — вводить вручную не
          нужно.
        </div>
      </label>

      {/* Индикатор типа + статуса разбора */}
      {detected.kind === "seed" && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/5 px-2.5 py-1 text-[11px] text-success">
          <Check className="h-3 w-3" /> Сид-фраза распознана
        </div>
      )}
      {detected.kind === "key" && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/5 px-2.5 py-1 text-[11px] text-violet-300">
          <KeyRound className="h-3 w-3" /> Приватный ключ распознан
        </div>
      )}
      {detectErr && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {detectErr}
        </div>
      )}

      {resolving && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Определяю аккаунт…
        </div>
      )}

      {/* Найденный аккаунт (read-only) */}
      {resolvedAccount && !resolving && (
        <div
          className={cn(
            "rounded-lg border p-2.5",
            fullAccess
              ? "border-success/40 bg-success/5"
              : "border-warning/40 bg-warning/5"
          )}
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Аккаунт {isNamed ? "(named)" : "(implicit)"}
          </div>
          <div className="mt-0.5 break-all font-mono text-xs text-foreground">
            {resolvedAccount}
          </div>
          {!fullAccess && (
            <div className="mt-1 text-[10px] text-warning">
              ⚠️ Ключ ограниченный (function-call). Видеть аккаунт можно, но
              подписать произвольную транзакцию нельзя — нужен full-access
              приват.
            </div>
          )}
        </div>
      )}

      {hasMasterPin() && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success">
          <Shield className="mr-1 inline h-3 w-3" />
          Ключ ляжет в защищённое хранилище браузера — скопировать его с
          устройства нельзя.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Добавить
        </button>
      </div>
    </form>
  );
}
