// Кошелёк страницы /storage: подключённый здесь внешний + кошельки YupLink
// этого браузера. PIN/пароль — только когда кошелёк YupLink их попросил.
import { Loader2, LogOut, Plug, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { StorageSigner } from "./storageSigners";

const field =
  "min-h-11 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm outline-none focus:border-gold/50";

export type StorageSecrets = {
  needPin: boolean;
  needPwd: boolean;
  pin: string;
  pwd: string;
  setPin: (v: string) => void;
  setPwd: (v: string) => void;
};

export function StorageWalletBar({
  signers,
  owner,
  secrets,
  onPick,
  onConnect,
  onDisconnect,
}: {
  signers: StorageSigner[] | null;
  owner: string | null;
  secrets: StorageSecrets;
  onPick: (accountId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  if (signers === null) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }
  const hasExternal = signers.some((s) => s.kind === "external");
  const ownerKind = signers.find((s) => s.accountId === owner)?.kind;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {signers.map((s) => {
          const active = s.accountId === owner;
          return (
            <div
              key={s.accountId}
              className={cn(
                "inline-flex min-h-11 max-w-full items-center rounded-xl border text-sm transition",
                active
                  ? "border-gold/70 bg-gold/10 text-foreground"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onPick(s.accountId)}
                className="inline-flex min-h-11 min-w-0 items-center gap-2 px-3"
              >
                <Wallet className="h-4 w-4 shrink-0" />
                <span className="truncate font-mono">{s.accountId}</span>
                {s.kind === "yuplink" && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                    YupLink
                  </span>
                )}
              </button>
              {s.kind === "external" && (
                <button
                  type="button"
                  onClick={onDisconnect}
                  aria-label={t("storage.disconnect")}
                  className="inline-flex h-11 w-10 shrink-0 items-center justify-center border-l border-border/60 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {!hasExternal && (
          <button
            type="button"
            onClick={onConnect}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
              signers.length === 0
                ? "gradient-gold text-gold-foreground shadow-gold"
                : "border border-dashed border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Plug className="h-4 w-4" />
            {t("storage.connect")}
          </button>
        )}
      </div>

      {ownerKind === "yuplink" && (secrets.needPwd || secrets.needPin) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {secrets.needPwd && (
            <input
              type="password"
              autoComplete="current-password"
              value={secrets.pwd}
              onChange={(e) => secrets.setPwd(e.target.value)}
              placeholder={t("storage.app_pwd")}
              className={field}
            />
          )}
          {secrets.needPin && (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={secrets.pin}
              onChange={(e) => secrets.setPin(e.target.value)}
              placeholder={t("storage.pin")}
              className={field}
            />
          )}
        </div>
      )}
    </div>
  );
}
