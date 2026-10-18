import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { NftCsvBatchSender } from "@/components/admin/NftCsvBatchSender";

export const Route = createFileRoute("/admin/nft-batch")({
  component: NftBatchPage,
});

function NftBatchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Батч-раздача NFT по CSV</h1>
          <p className="text-sm text-muted-foreground">
            Имя файла = тайтл NFT (хвост «_N» — количество), содержимое =
            получатели. Отправка с нашего кошелька одним батчем.
          </p>
        </div>
      </div>
      <NftCsvBatchSender />
    </div>
  );
}
