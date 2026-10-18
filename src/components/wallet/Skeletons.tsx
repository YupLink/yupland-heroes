// Shimmer-скелетоны для состояний загрузки кошелька. Показываются пока
// myWalletBalances / myWalletNfts грузятся — вместо голого «—»/пусто.
// Цель: убрать ощущение «зависло», дать премиальный лоадинг.

import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/** Скелетон крупного баланса в hero. */
export function BalanceSkeleton() {
  return (
    <div className="flex items-end gap-2">
      <Bar className="h-9 w-32" />
      <Bar className="h-5 w-12" />
    </div>
  );
}

/** Скелетон ряда мини-стат-виджетов. */
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-border/60 bg-card/50 p-2.5"
        >
          <Bar className="h-3 w-10" />
          <Bar className="mt-2 h-5 w-8" />
        </div>
      ))}
    </div>
  );
}

/** Скелетон строки актива. */
export function AssetRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-3">
      <Bar className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Bar className="h-3.5 w-20" />
        <Bar className="h-2.5 w-32" />
      </div>
      <Bar className="h-4 w-16" />
    </div>
  );
}

/** Список скелетон-строк активов. */
export function AssetsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <AssetRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Грид скелетонов NFT. */
export function NftGridSkeleton({ cells = 6 }: { cells?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {Array.from({ length: cells }).map((_, i) => (
        <Bar key={i} className="aspect-square w-full rounded-2xl" />
      ))}
    </div>
  );
}
