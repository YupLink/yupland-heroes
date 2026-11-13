// Окно генератора артефактов (§8.122): мои задания, заказ, «тик» рисования и
// «Сделать уникальным». Тик — как в лаборатории: окно само продвигает задание
// в очереди (по одному, раз в 3 с), ответ сразу кладётся в кэш.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { invalidateHeroQueries } from "@/lib/query";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import type { CraftRarity } from "@/lib/craft/craftTable";
import {
  getArtGenJobs,
  orderArtGen,
  tickArtGen,
  uniqueArtGen,
} from "@/server/api/art-gen/art-gen-api";
import type { GenJobView } from "@/server/api/art-gen/art-gen-view";

export const ART_GEN_KEY = ["art-gen-jobs"] as const;
const TICK_MS = 3000;

type View = {
  jobs: GenJobView[];
  left?: number | null;
  max?: number;
  step?: number | null;
  resetAt?: number | null;
};
const due = (j: GenJobView) => j.status === "queued" && Date.parse(j.nextAt) <= Date.now();

export function useArtGen(q: number, r: number) {
  const t = useT();
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ART_GEN_KEY, queryFn: () => getArtGenJobs(), staleTime: 0 });
  const put = (job: GenJobView) =>
    qc.setQueryData<View>(ART_GEN_KEY, (v) => {
      const jobs = v?.jobs ?? [];
      return jobs.some((j) => j.id === job.id)
        ? { ...v, jobs: jobs.map((j) => (j.id === job.id ? job : j)) }
        : { ...v, jobs: [job, ...jobs] };
    });
  // Деньги ушли или вернулись — счётчики ресурсов и энергии перечитываем.
  const money = () => {
    void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    void qc.invalidateQueries({ queryKey: ENERGY_KEY });
    void qc.invalidateQueries({ queryKey: ["my-like-balance"] });
  };
  const err = (e: Error) => toast.error(serverErrorText(e, t));

  // Ключ заказа — один на нажатие до ответа: двойной клик — то же задание.
  const nonce = useRef(nanoid(16));
  const order = useMutation({
    mutationFn: (d: { rarity: CraftRarity; words: string; step: number }) =>
      orderArtGen({ data: { q, r, ...d, op: nonce.current } }),
    onSuccess: ({ job }) => {
      nonce.current = nanoid(16);
      put(job);
      money();
      // «Осталось N из 50» и цена следующего заказа — свежие с сервера.
      void qc.invalidateQueries({ queryKey: ART_GEN_KEY });
    },
    onError: (e: Error) => {
      nonce.current = nanoid(16);
      err(e);
      void qc.invalidateQueries({ queryKey: ART_GEN_KEY });
    },
  });

  // Ключ попытки «уникальности» ставит сервер: повтор после отказа платит заново.
  const unique = useMutation({
    mutationFn: (id: string) => uniqueArtGen({ data: { q, r, id } }),
    onSuccess: ({ job }) => {
      put(job);
      money();
      toast.success(t("artgen.unique_done"));
    },
    onError: err,
  });

  // Тик заданий в очереди: по одному, без наложения; занятый генератор
  // (nextAt в будущем) не дёргаем — ждём срока.
  const busy = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      if (busy.current) return;
      const job = qc.getQueryData<View>(ART_GEN_KEY)?.jobs.find(due);
      if (!job) return;
      busy.current = true;
      tickArtGen({ data: { id: job.id } })
        .then(({ job: next }) => {
          put(next);
          if (next.status === "done") {
            toast.success(t("artgen.done"));
            // Арт лёг в инвентарь — окна артефактов и снаряжения перечитаются.
            invalidateHeroQueries(qc, ["my-game-items", "my-hero-gear"]);
          }
          if (next.status === "failed") money();
        })
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
        });
    }, TICK_MS);
    return () => clearInterval(timer);
    // put/t стабильны по смыслу — таймер один на окно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  return { state, order, unique };
}
