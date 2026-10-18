import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X, Gem, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { gotoChipsSub, type ChipsSubTab } from "@/lib/chipsNav";
import { getNftInputInfo, listMyDepositableNfts } from "@/server/api/chips-mint";
import { getSession } from "@/server/api/user-auth";
import { TreasuryWalletConnection } from "@/components/castle-live/TreasuryWalletConnection";
import {
  MAX_NFT_BATCH,
  displayOf,
  keyOf,
  toDepositNft,
  type DepositableNft,
} from "./nft-input-shared";
import { HolderNftSection } from "./HolderNftSection";
import { NFT_PER_TX, planChunks } from "./nftDepositBatch";
import { readBlocked } from "./nftInputBlocked";
import { useNftDeposit } from "./useNftDeposit";
import { useNftGroups } from "./useNftGroups";
import { NftInputRow } from "./NftInputRow";
import { NftDepositResult } from "./NftDepositResult";
import "./nft-input-game.css";

export function NftInputModal({ onClose, stayOnPacks = false }: { onClose: () => void; stayOnPacks?: boolean }) {
  const t = useT();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const hasWallet = !!session.data?.wallet;
  const info = useQuery({
    queryKey: ["nft-input-info"],
    queryFn: () => getNftInputInfo(),
    staleTime: 5 * 60_000,
    enabled: hasWallet,
  });
  const list = useQuery({
    queryKey: ["depositable-nfts"],
    queryFn: () => listMyDepositableNfts(),
    enabled: hasWallet,
  });

  const { depositMany, outcome, progress, dismissOutcome } = useNftDeposit(info.data);
  // Индикатор живой: обе кнопки идут через depositMany, и пока она в работе
  // окно не закрыть и вторую подпись не запустить. Раньше busy считался по
  // мутации, которую модалка вообще не звала, — оверлей не показывался никогда.
  const busy = depositMany.isPending;

  // Уже введённые NFT (по нашим отметкам): список с индексатора отстаёт, и
  // повторное нажатие стоило бы газа ради отказа сервера.
  // Перечитываем отметки, когда приехал новый список или закончилась операция.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- readBlocked() читает
  // localStorage: реактивности у неё нет, поводом служат ровно эти два события.
  const blocked = useMemo(() => readBlocked(), [list.dataUpdatedAt, outcome]);
  const all: DepositableNft[] = list.data ?? [];
  const items = all.filter((i) => !blocked[keyOf(i)]);
  const blockedItems = all.filter((i) => blocked[keyOf(i)]);

  const {
    groups,
    selected,
    selectedKeys,
    selectedItems,
    batchableItems,
    cappedTotal,
    allSelected,
    qtyOf,
    setQty,
    toggleGroup,
    selectAll,
    clearAll,
  } = useNftGroups(items);

  const depositGroup = (g: (typeof groups)[number], n: number) => {
    const tokens = g.tokens.slice(0, Math.min(n, MAX_NFT_BATCH));
    depositMany.mutate(tokens.map(toDepositNft));
  };

  const goTo = (sub: ChipsSubTab) => {
    dismissOutcome();
    if (sub !== "packs" || !stayOnPacks) gotoChipsSub(sub);
    onClose();
  };

  // Сколько транзакций уйдёт на выбранное: пак и фишка разъезжаются по разным
  // партиям, поэтому считаем настоящим планировщиком, а не делением на 10.
  const batches = planChunks(selectedItems.map(toDepositNft)).length;

  const hasPack = items.some((it) => it.rewardType === "pack");
  const hasChip = items.some((it) => it.rewardType === "chip");
  const hint = hasPack && !hasChip ? "pack" : hasChip && !hasPack ? "chip" : "mixed";

  return createPortal(
    <div
      className="nft-input-backdrop fixed inset-0 z-[160] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("chips.enter_nft")}
      onClick={() => !busy && onClose()}
    >
      <div
        className="nft-input-sheet relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain sm:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nft-input-head sticky top-0 z-10 flex items-center justify-between">
          <div className="nft-input-title flex items-center gap-2">
            <Gem className="h-5 w-5" aria-hidden="true" /> {t("chips.enter_nft")}
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="nft-input-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="nft-input-body space-y-3">
          {hasWallet && <p className="nft-input-hint">
            {t(`chips.nft_hint_${hint}`)}
          </p>}

          {batchableItems.length > 1 && (
            <div className="nft-input-batch space-y-1.5 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={allSelected ? clearAll : selectAll}
                    disabled={busy}
                    className="nft-input-secondary rounded-md px-2 py-1 font-medium disabled:opacity-50"
                  >
                    {allSelected ? t("chips.deselect") : t("chips.select_all", { n: cappedTotal })}
                  </button>
                  <span className="text-muted-foreground">
                    {t("chips.selected_count", { n: selected.size })}
                    {batchableItems.length > MAX_NFT_BATCH && (
                      <span className="ml-1 text-[#e7cf92]">
                        {t("chips.cap_max", { n: MAX_NFT_BATCH })}
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy || selectedKeys.length === 0}
                  onClick={() => depositMany.mutate(selectedItems.map(toDepositNft))}
                  className="nft-input-primary inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("chips.enter_n", { n: selectedKeys.length })}
                </button>
              </div>
              {batches > 1 && (
                <div className="text-[10px] leading-snug text-[#e7cf92]">
                  {t("chips.nft_many_batches", { n: batches, per: NFT_PER_TX })}
                </div>
              )}
            </div>
          )}

          {session.isPending ? (
            <div role="status" className="nft-input-state p-4 text-center text-sm">{t("common.loading")}</div>
          ) : session.isError ? (
            <div role="alert" className="nft-input-state p-4 text-center text-sm">
              <p>{t("common.error")}</p>
              <button type="button" className="nft-input-secondary" onClick={() => void session.refetch()}>{t("chips.retry")}</button>
            </div>
          ) : !hasWallet ? (
            <div className="nft-input-wallet">
              <p>{t("chips.nft_connect_wallet_hint")}</p>
              <TreasuryWalletConnection wallet={null} status="disconnected" purpose="nft" />
            </div>
          ) : list.isLoading || info.isLoading ? (
            <div role="status" className="nft-input-state flex items-center justify-center py-10 text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chips.searching_nfts")}
            </div>
          ) : list.isError || info.isError ? (
            <div role="alert" className="nft-input-state p-4 text-center text-sm">
              <p>{t("chips.nft_load_failed")}</p>
              <button type="button" className="nft-input-secondary" onClick={() => { void list.refetch(); void info.refetch(); }}>{t("chips.retry")}</button>
            </div>
          ) : items.length === 0 ? (
            <div className="nft-input-state p-4 text-center text-sm">
              {blockedItems.length > 0 ? t("chips.nft_all_entered") : t("chips.no_suitable_nfts")}
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const qty = qtyOf(g);
                return (
                  <NftInputRow
                    key={g.key}
                    group={g}
                    qty={qty}
                    selected={qty > 0 && g.keys.slice(0, qty).every((k) => selected.has(k))}
                    busy={busy}
                    onToggle={() => toggleGroup(g)}
                    onQty={(n) => setQty(g, n)}
                    onDeposit={() => depositGroup(g, qty)}
                  />
                );
              })}
            </div>
          )}

          {hasWallet && <HolderNftSection />}

          {blockedItems.length > 0 && (
            <div className="nft-input-already space-y-1 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("chips.nft_already_in_game", { n: blockedItems.length })}
              </div>
              <div className="text-[10px] leading-snug text-muted-foreground">
                {blockedItems
                  .map((i) => displayOf(i, t).mainTitle)
                  .slice(0, 6)
                  .join(", ")}
              </div>
              <div className="text-[10px] leading-snug text-muted-foreground">
                {t("chips.nft_already_hint")}
              </div>
            </div>
          )}
        </div>
      </div>

      {busy && (
        <div
          className="absolute inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-black/85 p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <Loader2 className="h-8 w-8 animate-spin text-[#f3ca62]" />
          <div className="text-sm font-medium text-white">{t("chips.transferring_nft")}</div>
          {progress && (
            <div className="text-[11px] text-[#f3ca62]">
              {progress.total > 1 &&
                `${t("chips.nft_batch_progress", { i: progress.step, n: progress.total })} · `}
              {t(progress.phase === "sign" ? "chips.nft_phase_sign" : "chips.nft_phase_issue")}
            </div>
          )}
          <div className="text-[11px] text-white/60">{t("chips.dont_close")}</div>
        </div>
      )}

      {/* Стойкий экран результата: висит до нажатия кнопки, не мелькает, и тот
          же самый догонит игрока при следующем заходе (NftInputReceipt). */}
      {outcome && (
        <NftDepositResult
          outcome={outcome}
          onGo={goTo}
          onDismiss={dismissOutcome}
          // «Закрыть» — тоже прочитал: снимаем и квитанцию, иначе тот же экран
          // встретит игрока при следующем заходе.
          onClose={() => {
            dismissOutcome();
            onClose();
          }}
        />
      )}
    </div>,
    document.body,
  );
}
