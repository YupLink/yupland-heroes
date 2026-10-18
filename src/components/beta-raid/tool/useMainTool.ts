// Основной инструмент глазами клиента (ПРАВИЛА §8.24): что в руках героя, чем
// действовать и «Взять …» / «Убрать из рук».
//
// Источник — рюкзак выбранного героя (getMyBackpack: mainTool и tool у стопок),
// один кэш с окнами рюкзака. Смена основного и любой удар инструментом
// перечитывают его (invalidateBackpack), поэтому значок, кнопки и окна видят
// сломанную штуку и замену без F5. Решает сервер: здесь только вид кнопок.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { pickMain, type MainPick, type ToolNeed } from "@/lib/raid/mainTool";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { setMainTool } from "@/server/api/beta-raid/main-tool/main-tool-set";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";

const BACKPACK_KEY = ["my-hero-backpack"];

/** Взять в руки (ключ стопки) или убрать из рук (null): кэш правим сразу, потом перечитка. */
export function useSetMainTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stackKey: string | null) => setMainTool({ data: { stackKey } }),
    onSuccess: (res) => {
      qc.setQueryData<BackpackView>(BACKPACK_KEY, (old) =>
        old ? { ...old, mainTool: res.main } : old,
      );
      invalidateBackpack(qc);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      invalidateBackpack(qc);
    },
  });
}

/** enabled: false — только читать то, что уже в кэше. */
export function useMainTool(enabled = true) {
  const bp = useQuery({ queryKey: BACKPACK_KEY, queryFn: () => getMyBackpack(), enabled });
  const set = useSetMainTool();
  // Ответ из persist-кэша прошлой версии полей не знает — читаем защищённо.
  const stacks = Array.isArray(bp.data?.stacks) ? bp.data.stacks : [];
  const key = typeof bp.data?.mainTool === "string" ? bp.data.mainTool : null;
  const main = stacks.find((s) => s.stackKey === key && s.count >= 1) ?? null;
  return {
    /** Рюкзак приехал: до него кнопки не запрещаем — откажет сервер, если что. */
    ready: !!bp.data,
    main,
    stacks,
    loading: bp.isLoading,
    failed: bp.isError,
    retry: () => void bp.refetch(),
    takeAsync: (stackKey: string | null) => set.mutateAsync(stackKey),
    pick: (need: ToolNeed): MainPick => pickMain(main?.stackKey ?? null, stacks, need),
    nameOf: (stackKey: string): string => stacks.find((s) => s.stackKey === stackKey)?.name ?? "",
    take: (stackKey: string | null) => set.mutate(stackKey),
    busy: set.isPending,
  };
}
