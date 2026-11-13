import { useLayoutEffect } from "react";
import { enterPurchaseMusic } from "@/lib/audio/purchaseMusic";

/** Start in the opening render's layout phase, before the first visible frame. */
export function usePurchaseMusic(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    try { return enterPurchaseMusic(); }
    catch { /* Optional music must never prevent shopping. */ }
  }, [active]);
}
