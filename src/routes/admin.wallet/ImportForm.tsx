import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Shield } from "lucide-react";
import { lookupAccountsByPublicKey } from "@/server/api/embedded";
import {
  importEmbeddedWalletBySeed,
  importEmbeddedWalletByPrivateKey,
  derivePublicFromPrivateKey,
} from "@/lib/embeddedWallet";
import { getSession } from "@/server/api/user-auth";
import { signedConnect } from "@/lib/signedConnect";
import { registerEmbeddedWallet } from "@/server/api/embedded";
import { hasMasterPin } from "@/lib/masterKey";
import { detectImportInput } from "./helpers";
import type { DetectedInput } from "./types";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

export function ImportForm({
  onDone,
  onCancel,
}: {
  onDone: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [detected, setDetected] = useState<DetectedInput>({ kind: "empty" });
  const [resolving, setResolving] = useState(false);
  const [resolvedAccount, setResolvedAccount] = useState<string | null>(null);
  const [isNamed, setIsNamed] = useState(false);
  const [fullAccess, setFullAccess] = useState(true);
  const [detectErr, setDetectErr] = useState<string | null>(null);

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

        let publicKeyStr: string;
        let implicitId: string;
        if (det.kind === "seed") {
          const { deriveRawKeyFromSeedPhrase } = await import("@/lib/embeddedWallet");
          const r = await deriveRawKeyFromSeedPhrase(det.seed);
          publicKeyStr = r.publicKeyStr;
          implicitId = r.accountId;
        } else {
          const r = await derivePublicFromPrivateKey(det.key);
          publicKeyStr = r.publicKeyStr;
          implicitId = r.accountId;
        }
        if (cancelled) return;

        try {
          const res = await lookupAccountsByPublicKey({ data: { publicKey: publicKeyStr } });
          if (cancelled) return;
          const named = (res.accountIds ?? []).filter(
            (id) => id.length !== 64 || !/^[0-9a-f]+$/i.test(id),
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
          setResolvedAccount(implicitId);
          setIsNamed(false);
          setFullAccess(true);
        }
      } catch (e) {
        if (!cancelled) setDetectErr(e instanceof Error ? e.message : "Ошибка разбора ввода");
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  // Админ (кошелёк-менеджер проекта) хранит кошельки без пристёгивания к своему
  // Telegram — сервер это разрешает только ему (embedded.ts).
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;

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
      // Пристегнуть к Telegram — только подписью (18.10.2026), игра остаётся на текущем.
      if (!admin) await signedConnect({ accountId: w.accountId, kind: "embedded", stay: true });
      await registerEmbeddedWallet({ data: { accountId: w.accountId, publicKey: w.publicKey } });
      return w;
    },
    onSuccess: (w) => {
      toast.success("Импортирован");
      setValue("");
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
        <div className="mb-1 text-xs text-muted-foreground">Сид-фраза или приватный ключ</div>
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
          Определим автоматически. Аккаунт подставится сам — вводить вручную не нужно.
        </div>
      </label>
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
      {resolvedAccount && !resolving && (
        <div
          className={cn(
            "rounded-lg border p-2.5",
            fullAccess ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5",
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
              ⚠️ Ключ ограниченный (function-call). Видеть аккаунт можно, но подписать произвольную
              транзакцию нельзя — нужен full-access приват.
            </div>
          )}
        </div>
      )}
      {hasMasterPin() && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success">
          <Shield className="mr-1 inline h-3 w-3" />
          Ключ ляжет в защищённое хранилище браузера — скопировать его с устройства нельзя.
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
