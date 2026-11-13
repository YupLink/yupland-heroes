import { plantOfStack } from "@/lib/treePlant";
import { treePlacement, type TreeItem } from "./treePlacement";
const listeners = new Set<() => void>();
/** Always emits, including when the world has not mounted yet. */
export function requestTreeMap(item: TreeItem): boolean {
  if (plantOfStack(item.stackKey)?.kind !== "tree" || !treePlacement.start(item)) return false;
  listeners.forEach(fn => fn());
  return true;
}
export function onTreeMapStart(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
