import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimShortTutorialSpell, getShortTutorialReward, skipShortTutorialStep } from "@/server/api/beta-raid/island/short-tutorial-api";
import { useLang } from "@/lib/i18n";
import { ISLAND_KEY } from "./useIsland";

import { thumb } from "@/lib/image";
export function IslandShortReward() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const reward = useQuery({ queryKey: ["island-short-reward"], queryFn: () => getShortTutorialReward(), retry: false, staleTime: 0, refetchInterval: 4000 });
  const claim = useMutation({ mutationFn: () => claimShortTutorialSpell(), onSuccess: (r) => {
    toast.success(ru ? `${r.alreadyKnown ? "Уже в книге" : "Получено"}: ${r.name}` : `${r.alreadyKnown ? "In your spellbook" : "Received"}: ${r.name}`);
    void qc.invalidateQueries({ queryKey: ISLAND_KEY });
    void qc.invalidateQueries({ predicate: (q) => /spell|hero/.test(String(q.queryKey[0] ?? "")) });
  } });
  return <div className="island-dialog__text">
    {reward.data && <p>{reward.data.image && <img src={thumb(reward.data.image, 96)} alt="" width={40} height={40} style={{ display: "inline-block", objectFit: "contain", verticalAlign: "middle", marginInlineEnd: 8 }} />}
      <b>{reward.data.name}</b><br />{reward.data.description}</p>}
    {(reward.error || claim.error) && <p role="alert">{(claim.error ?? reward.error)?.message}</p>}
    {reward.isError && <button type="button" data-game-button="secondary" onClick={() => void reward.refetch()}>{ru ? "Повторить" : "Retry"}</button>}
    <button type="button" data-game-button="primary" className="island-quest__show" disabled={!reward.data?.reachable || claim.isPending} onClick={() => claim.mutate()}>
      {claim.isPending ? (ru ? "Получаем…" : "Receiving…") : reward.data?.alreadyKnown ? (ru ? "Посмотреть заклинание" : "View spell") : (ru ? "Получить заклинание" : "Receive spell")}
    </button>
    {reward.data && !reward.data.reachable && <p>{ru ? "Переплыви озеро и подойди к отмеченному берегу." : "Sail across the lake and approach the marked shore."}</p>}
  </div>;
}

export function IslandShortSkip() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const skip = useMutation({ mutationFn: () => skipShortTutorialStep(), onSuccess: () => qc.invalidateQueries({ queryKey: ISLAND_KEY }), onError: (e: Error) => toast.error(e.message) });
  return <button type="button" className="island-skip__link" disabled={skip.isPending} onClick={() => skip.mutate()}>{ru ? "Пропустить шаг" : "Skip step"}</button>;
}
