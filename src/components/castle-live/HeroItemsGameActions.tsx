import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { discardBackpackStack } from "@/server/api/beta-raid/market-backpack-read";
import { BackpackDiscardModal } from "@/components/beta-raid/BackpackDiscardModal";
import { ToolCard } from "@/components/beta-raid/tool/ToolCard";
import { ItemUseCard } from "@/components/beta-raid/sight/ItemUseCard";
import { BackpackPlacePicker } from "@/components/beta-raid/BackpackPlacePicker";
import { placeKindOf } from "@/components/beta-raid/backpackPlace";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateBackpack } from "@/lib/query";
import { formatQty } from "@/lib/formatQty";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { dmineNameOr, isDaraiMineKey } from "@/lib/daraiMine";
import { treeNameOr } from "@/lib/treePlant";
import { HeroItemsUnified, type HeroItemActions } from "./HeroItemsUnified";

export function HeroItemsGameActions({ data, loading = false, readOnly, allowUse, beforeUse }: {
  data?: BackpackView;
  loading?: boolean;
  readOnly: boolean;
  allowUse: boolean;
  beforeUse?: () => Promise<void>;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  // Забранная DARAI-шахта — именем по виду стопки на языке игрока (lib/daraiMine);
  // дерево для посадки — переводом имени шаблона (lib/treePlant).
  const shown = useMemo(
    () => data && { ...data, stacks: data.stacks.map(s => ({ ...s, name: treeNameOr(s.stackKey, dmineNameOr(s.stackKey, s.name, lang), lang) })) },
    [data, lang],
  );
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [toolCard, setToolCard] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
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
  const stack = (key: string | null) => shown?.stacks.find(item => item.stackKey === key) ?? null;
  const actions: HeroItemActions = {
    // DARAI-шахту не выбрасывают — только размещают (lib/daraiMine).
    canDiscard: item => !readOnly && !isDaraiMineKey(item.stackKey),
    // Бинокль и лестница — «Применить» (sight/ItemUseCard), как в рюкзаке замка.
    canUseTool: item => !!(item.tool || item.shovel || item.binocular || item.ladder),
    canPlace: item => !readOnly && placeKindOf(item) !== null,
    discard: item => { discardOp.current = newOpId(); setDiscarding(item.stackKey); },
    useTool: item => setToolCard(item.stackKey),
    place: item => setPlacing(item.stackKey),
  };
  const discarded = stack(discarding);
  const tool = stack(toolCard);
  return <>
    <HeroItemsUnified data={shown} loading={loading} allowUse={allowUse} beforeUse={beforeUse} actions={actions} />
    {tool && tool.count >= 1 && (tool.binocular || tool.ladder
      ? <ItemUseCard stack={tool} readOnly={!allowUse} beforeUse={beforeUse} onClose={() => setToolCard(null)} />
      : <ToolCard stack={tool} main={tool.stackKey === data?.mainTool} readOnly={readOnly} onClose={() => setToolCard(null)} />)}
    {!readOnly && data && placing && <BackpackPlacePicker stackKey={placing} stacks={data.stacks} onClose={() => setPlacing(null)} />}
    {!readOnly && discarded && <BackpackDiscardModal name={discarded.name} image={discarded.image} total={discarded.count} durability={discarded.durability ?? null} busy={discard.isPending} onDiscard={qty => discard.mutate({ stackKey: discarded.stackKey, qty })} onClose={() => setDiscarding(null)} />}
  </>;
}
