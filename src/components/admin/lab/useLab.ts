// Состояние лаборатории: список заданий, создание и «тик» — окно само
// продвигает задания в очереди (по одному, раз в 3 с), ответ сразу кладётся в
// кэш: картинка и характеристики появляются без обновления страницы.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import {
  adminLabCraft,
  adminLabRetry,
  adminLabState,
  adminLabTick,
  type LabView,
} from "@/server/api/craft/lab-api";
import type { LabJob } from "@/server/api/craft/lab-sql";
import type { CraftRarity } from "@/lib/craft/craftTable";

const KEY = ["admin-lab"] as const;
const TICK_MS = 3000;

export type LabDraft = { rarity: CraftRarity; words: string };

const due = (j: LabJob) => j.status === "queued" && Date.parse(j.nextAt) <= Date.now();

export function useLab() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: KEY, queryFn: (): Promise<LabView> => adminLabState() });

  const put = (job: LabJob) =>
    qc.setQueryData<LabView>(KEY, (v) => {
      if (!v) return v;
      const known = v.jobs.some((j) => j.id === job.id);
      return known
        ? { ...v, jobs: v.jobs.map((j) => (j.id === job.id ? job : j)) }
        : { ...v, today: v.today + 1, jobs: [job, ...v.jobs] };
    });

  // Ключ задания — один на нажатие «Создать» до ответа: двойной клик приносит
  // тот же ключ, и сервер вернёт то же задание. После ответа — новый.
  const nonce = useRef(nanoid(16));
  const craft = useMutation({
    mutationFn: (d: LabDraft) => adminLabCraft({ data: { ...d, nonce: nonce.current } }),
    onSuccess: ({ job }) => {
      nonce.current = nanoid(16);
      put(job);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const retry = useMutation({
    mutationFn: (id: string) => adminLabRetry({ data: { id } }),
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });

  // Тик заданий в очереди: по одному, без наложения; занятый генератор
  // (nextAt в будущем) не дёргаем — ждём срока.
  const busy = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      if (busy.current) return;
      const job = qc.getQueryData<LabView>(KEY)?.jobs.find(due);
      if (!job) return;
      busy.current = true;
      adminLabTick({ data: { id: job.id } })
        .then(({ job: next }) => put(next))
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
        });
    }, TICK_MS);
    return () => clearInterval(timer);
    // put стабилен по смыслу (пишет в тот же ключ) — таймер один на окно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  return { state, craft, retry };
}
