import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import { saveWalletBackup, getWalletBackup } from "@/server/api/embedded";
import { MIN_PASSWORD_LEN, type BackupBlob } from "@/lib/walletBackup";
import { getSeedPhrase, importEmbeddedWalletBySeed } from "@/lib/embeddedWallet";
import { encryptSeed, decryptSeed } from "@/lib/walletBackup";
import { cn } from "@/lib/utils";

export function WalletBackupPanel({ accountId }: { accountId: string }) {
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
    return () => { alive = false; };
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
        if (pwd.length < MIN_PASSWORD_LEN) throw new Error(`Пароль минимум ${MIN_PASSWORD_LEN} символов`);
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
            {hasBackup === undefined ? "…" : hasBackup
              ? "Бэкап есть · восстановится по паролю на любом устройстве"
              : "Бэкапа нет — сделай, чтобы не потерять кош при чистке хранилища"}
          </span>
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => toggle("backup")} className="flex-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs transition hover:border-gold/40">
          Сделать бэкап
        </button>
        <button onClick={() => toggle("restore")} disabled={!hasBackup} className="flex-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs transition hover:border-gold/40 disabled:opacity-40">
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
