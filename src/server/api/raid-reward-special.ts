// Строки «Добычи» со своей выдачей по ссылке строки (pack_id): клад (§8.117) и
// доля владельцев казино (§8.124). Вынесено из grantRaidReward (raid-helpers.ts
// упёрся в 250 строк).
import { CASINO_SHARE_KIND } from "@/lib/casinoShare";

export async function claimSpecial(kind: string, packId: string, wallet: string): Promise<void> {
  if (kind === "treasure") {
    return (await import("./treasure/treasure-harvest")).claimTreasure(packId, wallet);
  }
  if (kind === CASINO_SHARE_KIND) {
    return (await import("./casino/casino-share")).claimCasinoShare(packId, wallet);
  }
  throw new Error(`claimSpecial: ${kind}`);
}
