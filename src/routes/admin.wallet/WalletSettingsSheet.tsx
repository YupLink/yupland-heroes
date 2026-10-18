import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  Settings,
  Check,
  Copy,
  Trash2,
  X,
  Shield,
} from "lucide-react";
import { removeEmbeddedWallet } from "@/server/api/embedded";
import { removeLocalWallet } from "@/lib/embeddedWallet";
import { hasMasterPin } from "@/lib/masterKey";
import { SettingsSection, SettingsDivider } from "./inputs";
import { AppLockPanel } from "./AppLockPanel";
import { MasterPinPanel } from "./MasterPinPanel";
import { SeedReveal } from "./SeedReveal";
import { PrivateKeyReveal } from "./PrivateKeyReveal";
import { WalletBackupPanel } from "./WalletBackupPanel";
import { humanError } from "@/lib/humanError";

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
      try {
        await removeEmbeddedWallet({ data: { accountId } });
      } catch {
        /* привязка не совпала / уже не зарегистрирован */
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
        <div className="space-y-5 overflow-y-auto px-5 py-5">
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
          <SettingsSection title="Безопасность">
            <AppLockPanel />
            {hasMasterPin() && <MasterPinPanel />}
            <SeedReveal accountId={accountId} />
            <PrivateKeyReveal accountId={accountId} />
            <WalletBackupPanel accountId={accountId} />
          </SettingsSection>
          <SettingsDivider />
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
