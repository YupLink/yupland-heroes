// Ввод NFT «Yupik holder (N million darai)» в стейкинг банка (ПРАВИЛА §8.51) —
// только админам: у игрока раздел не появляется вовсе. Выбрал NFT — подписал
// перевод на склад — сервер доказал перевод и завёл вклад: N млн DARAI в банке
// без лока. Индекс не успел — «Проверить» спросит ещё раз (и обход догонит сам).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { getSession } from "@/server/api/user-auth";
import { getHolderInputInfo, listHolderNfts, stakeHolderNfts } from "@/server/api/bank/holder-nft";
import { NFT_PER_TX, sendChunkTx } from "./nftDepositBatch";

export const HOLDER_NFTS_KEY = ["holder-nfts"] as const;
const STAKE_KEY = ["bank-stake"] as const;

type Sent = { tokenIds: string[]; txHash: string };

export function HolderNftSection() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;
  const list = useQuery({
    queryKey: HOLDER_NFTS_KEY,
    queryFn: () => listHolderNfts(),
    enabled: admin,
  });
  const info = useQuery({
    queryKey: ["holder-input-info"],
    queryFn: () => getHolderInputInfo(),
    enabled: admin,
    staleTime: 300_000,
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState<Sent | null>(null);
  const mln = (n: number) =>
    `${(n / 1e6).toLocaleString(ru ? "ru-RU" : "en-US")} ${ru ? "млн" : "M"}`;

  const claim = async (s: Sent) => {
    const r = await stakeHolderNfts({ data: s });
    setSent(r.pending.length > 0 ? { tokenIds: r.pending, txHash: s.txHash } : null);
    if (r.staked.length > 0)
      toast.success(
        ru
          ? `В стейкинге банка: ${r.staked.length} NFT`
          : `Staked in the bank: ${r.staked.length} NFT`,
      );
    if (r.pending.length > 0)
      toast(
        ru
          ? "Перевод ещё в пути — проверь через минуту"
          : "Transfer still on its way — check in a minute",
      );
    for (const x of r.rejected) toast.error(`#${x.tokenId}: ${x.reason}`);
  };
  const refresh = () => {
    for (const key of [HOLDER_NFTS_KEY, STAKE_KEY])
      void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  };
  const send = useMutation({
    mutationFn: async (tokenIds: string[]) => {
      if (!info.data) throw new Error(ru ? "Подожди, загружается" : "Loading, wait");
      const txHash = await sendChunkTx(
        { contract: info.data.contract, tokenIds },
        info.data.receiverId,
      );
      // NFT уже ушла: даже если ответ сервера потеряется, «Проверить» останется под рукой.
      setPicked([]);
      setSent({ tokenIds, txHash });
      await claim({ tokenIds, txHash });
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: refresh,
  });
  const check = useMutation({
    mutationFn: (s: Sent) => claim(s),
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: refresh,
  });

  const items = list.data ?? [];
  if (!admin || (items.length === 0 && !sent)) return null;
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < NFT_PER_TX ? [...p, id] : p,
    );
  const total = items.filter((i) => picked.includes(i.tokenId)).reduce((s, i) => s + i.darai, 0);
  const busy = send.isPending || check.isPending;

  return (
    <div className="nft-input-batch space-y-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#f3ca62]">
          <Landmark className="h-4 w-4" aria-hidden="true" />{" "}
          {ru ? "Юпики-холдеры → стейкинг банка" : "Yupik holders → bank staking"}
        </span>
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={() => send.mutate(picked)}
          className="nft-input-primary inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[11px] disabled:opacity-40"
        >
          {send.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {picked.length > 0
            ? `${ru ? "Ввести" : "Enter"} ${mln(total)} DARAI`
            : ru
              ? "Ввести"
              : "Enter"}
        </button>
      </div>
      {sent && (
        <button
          type="button"
          disabled={busy}
          onClick={() => check.mutate(sent)}
          className="nft-input-secondary w-full rounded-md px-2 py-1.5 text-[11px] disabled:opacity-40"
        >
          {check.isPending && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
          {ru
            ? `Проверить перевод (${sent.tokenIds.length})`
            : `Check transfer (${sent.tokenIds.length})`}
        </button>
      )}
      <div className="space-y-1.5">
        {items.map((n) => (
          <label
            key={n.tokenId}
            className="nft-input-row flex cursor-pointer items-center gap-3 rounded-xl p-2"
          >
            <input
              type="checkbox"
              checked={picked.includes(n.tokenId)}
              onChange={() => !busy && toggle(n.tokenId)}
              disabled={busy}
              className="h-4 w-4 shrink-0 accent-[#f3ca62]"
            />
            {n.media ? (
              <img src={n.media} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-lg bg-secondary" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold">{mln(n.darai)} DARAI</div>
              <div className="truncate text-[10px] text-muted-foreground">
                #{n.tokenId} ·{" "}
                {ru
                  ? `вывод из игры через ${n.unlockDays} дн, −5 %`
                  : `game exit after ${n.unlockDays} d, −5 %`}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
