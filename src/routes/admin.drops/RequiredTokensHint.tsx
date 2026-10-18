import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function RequiredTokensHint({
  rewardMax,
  isRange,
  maxTotalPool,
  maxUsers,
  totalNfts,
  comboMaxSets,
  freeClaim,
  token,
  balanceHuman,
  balanceRaw,
  decimals,
}: {
  rewardMax: number;
  isRange: boolean;
  maxTotalPool: number | null;
  maxUsers: number | null;
  totalNfts: number;
  comboMaxSets: number | null;
  freeClaim: boolean;
  token: string;
  balanceHuman: string;
  balanceRaw: string;
  decimals: number;
}) {
  let needed: number | null = null;
  let basis = "";
  if (comboMaxSets != null) {
    needed = comboMaxSets * rewardMax;
    basis = comboMaxSets === 0 ? "ни одного комбо собрать нельзя" : `${comboMaxSets} комбо × ${rewardMax}`;
  } else if (maxTotalPool != null) {
    needed = maxTotalPool;
    basis = "ограничен фондом";
  } else if (maxUsers != null) {
    needed = maxUsers * rewardMax;
    basis = `${maxUsers} участников × ${rewardMax}`;
  } else if (totalNfts > 0) {
    needed = totalNfts * rewardMax;
    basis = `${totalNfts} NFT × ${rewardMax}`;
  }

  if (needed == null) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
        Без лимитов и без NFT нельзя посчитать необходимый объём токенов.
      </div>
    );
  }

  const neededRaw = BigInt(needed) * 10n ** BigInt(decimals);
  const enough = BigInt(balanceRaw) >= neededRaw;

  return (
    <div className={cn("rounded-xl border p-3 text-xs", enough ? "border-success/30 bg-success/5 text-success" : "border-destructive/30 bg-destructive/5 text-destructive")}>
      <div className="flex items-start gap-2">
        {enough ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <div className="flex-1 text-foreground">
          <div className="font-medium">
            Нужно{isRange ? " (макс)" : ""}: <span className={enough ? "text-success" : "text-destructive"}>{needed} {token}</span> <span className="text-muted-foreground">· {basis}</span>
          </div>
          <div className="mt-0.5 text-muted-foreground">
            На сервисном: <span className="text-foreground">{balanceHuman} {token}</span>
            {!enough && " — пополни перед запуском"}
            {freeClaim && <span className="ml-2 text-success">· free claim</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
