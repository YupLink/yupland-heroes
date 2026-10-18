import { NftImage } from "@/components/NftImage";

export function TicketNftCard({
  item,
}: {
  item: {
    tokenId: string;
    title: string;
    media: string;
  };
}) {
  return (
    <div className="card-cv w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-success/30 bg-card sm:w-28">
      <div className="relative aspect-square overflow-hidden bg-secondary">
        {item.media ? (
          <NftImage
            src={item.media}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            #{item.tokenId}
          </div>
        )}
        <div className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white backdrop-blur-sm">
          #{item.tokenId}
        </div>
      </div>
    </div>
  );
}
