import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { isValidNearAccountForPayout } from "@/lib/nearAccountValidate";
import { myClaimHistory } from "@/server/api/user-claim-history";
import {
  Sparkles,
  ChevronUp,
  ChevronDown,
  Gift,
  Loader2,
  ExternalLink,
} from "lucide-react";

export type PendingNftItem = {
  id: string;
  contract_id: string;
  token_id: string;
  campaign_id: string | null;
  claimed_at: string;
  nftTitle?: string | null;
};

type SisterWallet = { wallet: string; isActive: boolean };

/**
 * История платных клеймов: последние 50, что выпало. Цена — в золоте
 * (билеты ×500, ПРАВИЛА §8.61), даже у клеймов до 20.10.2026.
 * Свёрнута по умолчанию — раскрывается по клику.
 */
export function ClaimHistorySection() {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const history = useQuery({
    queryKey: ["my-claim-history"],
    queryFn: () => myClaimHistory(),
    staleTime: 30_000,
  });
  const rows = history.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-sm transition hover:bg-gold/10",
          expanded && "rounded-b-none"
        )}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-gold" />
        <span className="flex-1 text-left text-gold/90">
          {t("mynfts.history_label", { n: rows.length })}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-gold/80" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gold/80" />
        )}
      </button>
      {expanded && (
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-b-xl border-x border-b border-gold/30 bg-gold/5 p-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={r.dropName}>
                  {r.dropName}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(r.redeemedAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {t("mynfts.tickets_many", {
                    n: goldForTicketPrice(r.ticketCost).toLocaleString("ru-RU"),
                  })}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-bold",
                  r.kind === "ft"
                    ? "bg-gold/20 text-gold"
                    : r.kind === "nft"
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-secondary text-muted-foreground"
                )}
                title={r.label}
              >
                {r.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PendingNftsSection({
  items,
  sisters,
  sessionWallet,
  onWithdraw,
  isPending,
  canWithdraw = true,
}: {
  items: PendingNftItem[];
  sisters: SisterWallet[];
  sessionWallet: string | null;
  onWithdraw: (recipient: string) => void;
  isPending: boolean;
  /** Белый список вывода (§8.127): нет — список призов без кнопки вывода. */
  canWithdraw?: boolean;
}) {
  const t = useT();
  // Из списка убираем всё, что нельзя отправить в цепь. tg<telegram_id> —
  // внутренний идентификатор игрока, а не NEAR-адрес: раньше он показывался
  // как «Активный кошелёк», игрок выводил на него, ft_transfer уходил в
  // никуда и средства оседали на балансе контракта.
  const payoutSisters = useMemo(
    () => sisters.filter((s) => isValidNearAccountForPayout(s.wallet)),
    [sisters],
  );
  // Default: активный кошелёк (или первый из подключённых) — только среди
  // валидных для вывода. Если валидных нет, оставляем поле пустым — UI ниже
  // отдельно покажет «Кошелёк не привязан».
  const defaultSister =
    payoutSisters.find((s) => s.isActive)?.wallet ??
    payoutSisters[0]?.wallet ??
    (isValidNearAccountForPayout(sessionWallet) ? (sessionWallet as string) : "") ??
    "";
  // 'custom' → ввод произвольного адреса; иначе одно из значений payoutSisters
  const [selected, setSelected] = useState<string>(defaultSister);
  const [manualRecipient, setManualRecipient] = useState(() => {
    try {
      return localStorage.getItem("yl-nft-recipient") ?? "";
    } catch {
      return "";
    }
  });

  const isCustom = selected === "__custom__";
  // Валидатор общий с сервером (isValidNearAccountForPayout): только .tg /
  // .near / 64-hex. Раньше здесь regex пропускал любую строку 2..64 символов
  // — включая внутренний tg<telegram_id>, — и клиент разрешал отправить.
  const customValid = isValidNearAccountForPayout(manualRecipient);
  const canSubmit = isCustom ? customValid : !!selected;
  const noPayoutTarget = !isCustom && payoutSisters.length === 0;

  const handleClick = () => {
    if (isPending) return;
    const recipient = isCustom
      ? manualRecipient.trim().toLowerCase()
      : selected;
    if (!recipient) return;
    if (isCustom) {
      try {
        localStorage.setItem("yl-nft-recipient", recipient);
      } catch {
        /* ignore */
      }
    }
    onWithdraw(recipient);
  };

  return (
    <section className="mb-6 rounded-2xl border border-gold/30 bg-gold/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Gift className="h-4 w-4 text-gold" />
        {t("mynfts.nft_wins")} ({items.length})
      </div>
      <div className="mb-3 space-y-1.5">
        {items.slice(0, 8).map((n) => (
          <div
            key={n.id}
            className="flex items-center gap-2 rounded-lg border border-gold/30 bg-card px-2 py-1.5 text-xs"
            title={n.contract_id}
          >
            <Gift className="h-3 w-3 shrink-0 text-gold" />
            <span className="truncate font-medium">
              {n.nftTitle ?? "NFT"}
            </span>
          </div>
        ))}
        {items.length > 8 && (
          <div className="text-center text-[10px] text-muted-foreground">
            {t("mynfts.and_more", { n: items.length - 8 })}
          </div>
        )}
      </div>

      {canWithdraw && <>
      <div className="mb-2 space-y-1.5">
        <label className="block text-[11px] font-medium text-muted-foreground">
          {t("mynfts.where_to_withdraw")}
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={isPending}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono outline-none focus:border-gold/60"
        >
          {payoutSisters.length === 0 && (
            <option value="" disabled>
              — кошелёк не привязан —
            </option>
          )}
          {payoutSisters.map((s) => (
            <option key={s.wallet} value={s.wallet}>
              {s.wallet}
              {s.isActive ? ` · ${t("mynfts.active_wallet")}` : ""}
            </option>
          ))}
          <option value="__custom__">{t("mynfts.other_address")}</option>
        </select>
        {noPayoutTarget && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-tight text-amber-300">
            Настоящий кошелёк не привязан. Прикрепи адрес формата <b>…​.tg</b>,{" "}
            <b>…​.near</b> или <b>64-символьный hex</b> — выводить в никуда нельзя.
          </p>
        )}
        {isCustom && (
          <>
            <input
              type="text"
              value={manualRecipient}
              onChange={(e) => setManualRecipient(e.target.value)}
              placeholder={t("mynfts.address_placeholder")}
              spellCheck={false}
              autoCapitalize="off"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono outline-none focus:border-gold/60"
            />
            {manualRecipient && !customValid && (
              <p className="text-[10px] text-destructive">
                {t("mynfts.invalid_near_address")}
              </p>
            )}
          </>
        )}
      </div>

      <button
        onClick={handleClick}
        disabled={isPending || !canSubmit}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground shadow-gold disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5" />
        )}
        {isPending ? t("mynfts.sending_short") : t("mynfts.withdraw")}
      </button>
      </>}
    </section>
  );
}
