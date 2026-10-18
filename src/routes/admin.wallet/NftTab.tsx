import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Send } from "lucide-react";
import { myWalletNfts } from "@/server/api/embedded";
import { FAST_QUERY_OPTS } from "./types";
import { NftGridSkeleton } from "@/components/wallet/Skeletons";
import { NftImage } from "@/components/NftImage";
import type { SendTarget } from "./types";

export function NftTab({
  accountId,
  onSend,
}: {
  accountId: string;
  onSend: (t: SendTarget) => void;
}) {
  const nfts = useQuery({
    queryKey: ["my", "wallet", accountId, "nfts"],
    queryFn: () => myWalletNfts({ data: { accountId } }),
    staleTime: 60_000,
    ...FAST_QUERY_OPTS,
  });

  if (nfts.isLoading) {
    return <NftGridSkeleton cells={6} />;
  }

  const list = nfts.data ?? [];

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
        <ImageIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">NFT пока нет</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 animate-float-up">
      {list.map((n) => (
        <button
          key={`${n.contract_id}:${n.token_id}`}
          onClick={() =>
            onSend({
              kind: "nft",
              nftContract: n.contract_id,
              tokenId: n.token_id,
              title: n.title ?? n.token_id,
            })
          }
          className="group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:border-gold/50"
          title={`${n.title ?? ""} — нажми чтобы отправить`}
        >
          <NftImage
            src={n.media ?? null}
            alt={n.title ?? ""}
            className="aspect-square w-full"
          />
          {n.title && (
            <div className="truncate px-2 py-1.5 text-left text-[11px] font-medium">
              {n.title}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
            <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-gold-foreground">
              <Send className="h-3 w-3" /> Отправить
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
