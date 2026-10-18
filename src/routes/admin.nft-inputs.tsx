// Админка · Ввод NFT: разбор жалоб «отправил NFT — ничего не пришло».
//
// До этого экрана ответ на такую жалобу собирался руками, тремя SQL-запросами.
import { createFileRoute } from "@tanstack/react-router";
import { PackageSearch } from "lucide-react";
import { NftInputSearchPanel } from "@/components/admin/nft-inputs/NftInputSearchPanel";
import { NftInputOrphansPanel } from "@/components/admin/nft-inputs/NftInputOrphansPanel";

export const Route = createFileRoute("/admin/nft-inputs")({
  component: AdminNftInputs,
});

function AdminNftInputs() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="flex items-center gap-2">
        <PackageSearch className="h-5 w-5 shrink-0 text-gold" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">Ввод NFT</h1>
          <p className="text-[11px] text-muted-foreground">
            Кто что отправил на склад, что выдано и что можно догнать.
          </p>
        </div>
      </header>
      <NftInputSearchPanel />
      <NftInputOrphansPanel />
    </div>
  );
}
