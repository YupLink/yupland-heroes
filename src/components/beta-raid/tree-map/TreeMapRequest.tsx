import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n";
import { treeNameOr } from "@/lib/treePlant";
import type { TreeItem } from "./treePlacement";
import { requestTreeMap } from "./treeMapEvents";
export function TreeMapRequest({ item, onClose }: { item: TreeItem; onClose: () => void }) {
  const started = useRef(false);
  const lang = useLang();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    requestTreeMap({ ...item, name: treeNameOr(item.stackKey, item.name, lang) });
    onClose();
  }, [item, onClose, lang]);
  return null;
}
