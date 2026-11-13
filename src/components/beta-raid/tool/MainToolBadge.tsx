import { useSyncExternalStore } from "react";
import { useLang } from "@/lib/i18n";
import { useMainTool } from "./useMainTool";
import { MainHandControl, type HandTool } from "./MainHandControl";
import {
  dropHand,
  getHand,
  handKindOf,
  requestHand,
  subscribeHand,
} from "@/components/beta-raid/hand/handStore";

/**
 * Persistent main-hand slot; selection uses the existing backpack mutation.
 * Land of the Builders' world and dynamite can be held too (hand/handStore): the
 * slot shows them with the count, the map takes them (place / throw within 3 cells,
 * the hero keeps walking); the server tool stays as it was.
 */
export function MainToolBadge() {
  const ru = useLang() === "ru";
  const tool = useMainTool();
  const hand = useSyncExternalStore(subscribeHand, getHand, () => null);
  const asHand = (s: HandTool): HandTool => ({ ...s, tool: true, label: `×${s.count}` });
  const items = tool.stacks.filter((s) => handKindOf(s.stackKey) && s.count >= 1).map(asHand);
  const held = hand ? (items.find((s) => s.stackKey === hand.stackKey) ?? null) : null;
  const take = async (key: string | null) => {
    if (key && handKindOf(key)) {
      requestHand(key);
      return;
    }
    if (hand) {
      dropHand();
      if (key === null) return;
    }
    return tool.takeAsync(key);
  };
  return (
    <MainHandControl
      ru={ru}
      main={held ?? tool.main}
      stacks={[...tool.stacks.filter((s) => !handKindOf(s.stackKey)), ...items]}
      loading={tool.loading}
      failed={tool.failed}
      busy={tool.busy}
      onRetry={tool.retry}
      onTake={take}
    />
  );
}
