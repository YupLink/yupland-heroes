// Задание острова на клиенте: один запрос, на острове — опрос раз в 4 с (шаги
// засчитывает сервер по фактам карты, окно только показывает итог).
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ackIsland, getMyIsland, type IslandView } from "@/server/api/beta-raid/island/island-api";
import { isAckStep, type ACK_STEPS } from "@/lib/raid/island/steps";
import { useT } from "@/lib/i18n";

export const ISLAND_KEY = ["beta-raid-island"] as const;
const POLL_MS = 4000;

export function useIsland(enabled: boolean, onIslandMap: boolean) {
  return useQuery({
    queryKey: ISLAND_KEY,
    queryFn: () => getMyIsland(),
    enabled,
    staleTime: 2000,
    // Опрос — пока герой на острове: по карте или по ответу сервера (в замке
    // карты может не быть).
    refetchInterval: (q) => (onIslandMap || q.state.data?.island?.onIsland ? POLL_MS : false),
  });
}

type Ack = (typeof ACK_STEPS)[number] | "final";
type MyIsland = Awaited<ReturnType<typeof getMyIsland>>;

/** Засчитанный шаг — в кэш острова (без повторов). */
export function withAck(old: MyIsland | undefined, step: string): MyIsland | undefined {
  const island = old?.island;
  if (!old || !island || island.done.includes(step)) return old;
  return { ...old, island: { ...island, done: [...island.done, step] } };
}

/** «Понятно» на шаге: засчитать и перечитать остров. */
export function useIslandAck() {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: (data: { step: Ack; mapId?: string }) => ackIsland({ data }),
    onSettled: (result, _e, vars) => {
      if (result?.recorded === false) return;
      // Вне острова запрос выключен (IslandLayer), перечитка его не тронет: окно
      // «ты в основном мире» висело бы до перезагрузки — шаг кладём в кэш сами.
      if (result) qc.setQueryData<MyIsland>(ISLAND_KEY, (old) => withAck(old, vars.step));
      return qc.invalidateQueries({ queryKey: ISLAND_KEY });
    },
  });
  const mutate = ack.mutate;
  const mutateAsync = ack.mutateAsync;
  const onAck = useCallback((step: string) => mutate({ step: step as Ack }), [mutate]);
  const onViewAck = useCallback((step: "hero" | "chest_backpack", mapId: string) => mutateAsync({ step, mapId }), [mutateAsync]);
  return { onAck, onViewAck, busy: ack.isPending };
}

/** Тост на каждый шаг, засчитанный по факту (объяснения засчитывает сам игрок). */
export function useStepToasts(island: IslandView | null | undefined) {
  const t = useT();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!island) return;
    const done = new Set(island.done);
    const before = seen.current;
    seen.current = done;
    if (!before) return;
    for (const { id, skipped } of island.steps) {
      if (skipped) continue;
      if (isAckStep(id) || id === "leave" || !done.has(id) || before.has(id)) continue;
      toast.success(t("island.step_done", { title: t(`island.${id}.title`) }));
    }
  }, [island, t]);
}

/** После входа и выхода карта другая: перечитать всё, что знало прежнюю. */
export function useIslandRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({
      predicate: (q) => String(q.queryKey[0] ?? "").startsWith("beta-raid"),
    });
    void qc.invalidateQueries({ queryKey: ["home-castle"] });
    void qc.invalidateQueries({ queryKey: ["my-hero-backpack"] });
  };
}

