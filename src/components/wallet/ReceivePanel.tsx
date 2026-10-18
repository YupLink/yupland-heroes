import { Copy, Check, QrCode, ArrowDownLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isImplicit } from "./format";

/**
 * Панель «Получить»: полный адрес + копирование. QR — placeholder «скоро»
 * (тяжёлую QR-библиотеку специально не тянем). Логика та же, что была
 * в LocalWalletRow.showReceive, просто вынесена и оформлена красиво.
 */
export function ReceivePanel({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(accountId);
    setCopied(true);
    toast.success("Адрес скопирован");
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gold/25 bg-gold/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gold">
        <ArrowDownLeft className="h-4 w-4" />
        Получить активы
      </div>

      {/* QR placeholder — мягкая заглушка вместо тяжёлой либы */}
      <div className="flex items-center justify-center">
        <div className="relative flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-background/60">
          <QrCode className="h-12 w-12 text-gold/40" />
          <span className="absolute bottom-2 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold/70">
            QR · скоро
          </span>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Адрес NEAR {isImplicit(accountId) ? "(implicit)" : ""}
        </div>
        <button
          onClick={copy}
          className="group flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-gold/40"
        >
          <span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-foreground">
            {accountId}
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold transition group-hover:bg-gold/20">
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </span>
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Отправляй на этот адрес только активы сети NEAR. Перевод из других сетей
        будет потерян.
      </p>
    </div>
  );
}
