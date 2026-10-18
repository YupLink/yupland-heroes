import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { discardBackpackStack } from "@/server/api/beta-raid/market-backpack-read";
import { BackpackDiscardModal } from "@/components/beta-raid/BackpackDiscardModal";
import { ToolCard } from "@/components/beta-raid/tool/ToolCard";
import { guardStacks, isChestStack } from "@/components/beta-raid/chest/useChestActions";
import { ChestPlacePicker } from "@/components/beta-raid/chest/ChestPlacePicker";
import { PlainChestPlacePicker } from "@/components/beta-raid/plain-chest/PlainChestPlacePicker";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateBackpack } from "@/lib/query";
import { formatQty } from "@/lib/formatQty";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { HeroItemsUnified, type HeroItemActions } from "./HeroItemsUnified";

export function HeroItemsGameActions({ data, loading = false, readOnly, allowUse, beforeUse }: {
  data?: BackpackView;
  loading?: boolean;
  readOnly: boolean;
  allowUse: boolean;
  beforeUse?: () => Promise<void>;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [toolCard, setToolCard] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [placingPlain, setPlacingPlain] = useState<string | null>(null);
  const discardOp = useRef(newOpId());
  const discard = useMutation({
    mutationFn: (v: { stackKey: string; qty: number }) => {
      if (readOnly) throw new Error("Read only / Только просмотр");
      return discardBackpackStack({ data: { ...v, op: discardOp.current } });
    },
    onSuccess: (res) => {
      if (res.put > 0) toast.success(t("bag.discarded", { n: formatQty(res.put) }));
      else toast(t("bag.discard_worn_gone"));
      invalidateBackpack(qc);
      invalidateBags(qc);
      setDiscarding(null);
    },
    onError: (error: Error) => toast.error(humanError(error)),
  });
  const stack = (key: string | null) => data?.stacks.find(item => item.stackKey === key) ?? null;
  const actions: HeroItemActions = {
    canDiscard: () => !readOnly,
    canUseTool: item => !!(item.tool || item.shovel),
    canPlace: item => !readOnly && (isChestStack(item) || item.plainChest === true),
    discard: item => { discardOp.current = newOpId(); setDiscarding(item.stackKey); },
    useTool: item => setToolCard(item.stackKey),
    place: item => item.plainChest ? setPlacingPlain(item.stackKey) : setPlacing(item.stackKey),
  };
  const discarded = stack(discarding);
  const tool = stack(toolCard);
  return <>
    <HeroItemsUnified data={data} loading={loading} allowUse={allowUse} beforeUse={beforeUse} actions={actions} />
    {tool && tool.count >= 1 && <ToolCard stack={tool} main={tool.stackKey === data?.mainTool} readOnly={readOnly} onClose={() => setToolCard(null)} />}
    {!readOnly && data && placing && <ChestPlacePicker chestKey={placing} bosses={guardStacks(data.stacks)} onClose={() => setPlacing(null)} />}
    {!readOnly && placingPlain && <PlainChestPlacePicker stackKey={placingPlain} onClose={() => setPlacingPlain(null)} />}
    {!readOnly && discarded && <BackpackDiscardModal name={discarded.name} image={discarded.image} total={discarded.count} durability={discarded.durability ?? null} busy={discard.isPending} onDiscard={qty => discard.mutate({ stackKey: discarded.stackKey, qty })} onClose={() => setDiscarding(null)} />}
  </>;
}
