// Рыбалка глазами кнопки (ПРАВИЛА §8.35): состояние с сервера (getFishing — он
// же досчитывает созревший заброс), «Забросить» и «Хватит».
//
// Без F5: состояние перечитывается само к сроку ответа заброса (и не реже
// минуты), сразу — когда созрело больше, чем выдаётся за раз, когда герой сошёл
// с клетки и когда потратилась энергия (другое действие кончает рыбалку). Ответ
// — тостом «Улов: …» или «Ничего не поймал» (глушится «Уведомлениями в игре») и
// перечиткой рюкзака (удочка стёрлась); кончилась удочка — тоже. Тост — только у
// свежего ответа: восстановленный из кэша при загрузке страницы второй раз не
// покажется.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { newOpId } from "@/lib/opId";
import { gameInfoToast } from "@/lib/gameInfoToast";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { IDLE_FISH, type FishView } from "@/lib/raid/fishing";
import { getFishing, startFishing, stopFishing } from "@/server/api/beta-raid/fishing/fishing";

export const FISH_KEY = ["beta-fishing"] as const;

/** Герой постоял столько после шага — перечитать (рыбалка кончилась). */
const STEP_MS = 600;

type At = { q: number; r: number };

/**
 * enabled — у героя есть удочка; идущую рыбалку (по кэшу) читаем и без неё:
 * удочку продали или выбросили — досчёт закончит рыбалку, а не оставит висеть.
 * inHand — ключ удочки в руках: сменился (взял другое, убрал) — перечитать.
 */
export function useFishing(pos: At | null, enabled: boolean, inHand: string | null) {
  const qc = useQueryClient();
  const t = useT();
  const going = qc.getQueryData<FishView>(FISH_KEY)?.fishing === true;
  const q = useQuery({
    queryKey: FISH_KEY,
    queryFn: () => getFishing(),
    enabled: enabled || going,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d?.fishing) return false;
      return d.more ? 500 : Math.min(60_000, Math.max(1_000, (d.nextInMs ?? 60_000) + 1_000));
    },
  });
  const view: FishView = q.data && typeof q.data.fishing === "boolean" ? q.data : IDLE_FISH;
  const reload = () => void qc.invalidateQueries({ queryKey: FISH_KEY });

  // Свежий ответ: улов — тостом и в рюкзак; кончилась удочка — сказать.
  const mountedAt = useRef(Date.now());
  const seen = useRef(0);
  const at = q.dataUpdatedAt;
  useEffect(() => {
    if (!at || at < mountedAt.current || at === seen.current) return;
    seen.current = at;
    const got = Array.isArray(view.got) ? view.got : [];
    if (got.length > 0) {
      const items = got.map((g) => (g.n > 1 ? `${g.name} ×${g.n}` : g.name)).join(", ");
      gameInfoToast.success(t("fish.got", { items }));
    } else if (view.ended && view.ended !== "stop" && view.ended !== "rod") {
      // Заброс кончился без рыбы — сказать (владелец 05.10: «словил или не словил»).
      gameInfoToast(t("fish.nothing"));
    }
    if (view.ended === "rod") gameInfoToast(t("fish.rod_gone"));
    if (got.length > 0 || view.ended) invalidateBackpack(qc);
  }, [at, view, qc, t]);

  // Сошёл с клетки рыбалки — перечитать, когда постоит: рыбалка кончилась.
  const [pq, pr] = [pos?.q, pos?.r];
  const away = view.fishing && (pq !== view.q || pr !== view.r);
  useEffect(() => {
    if (!away) return;
    const id = setTimeout(reload, STEP_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away, pq, pr]);

  // Удочка в руках сменилась (взял другое, убрал, кончилась) — перечитать.
  const lastHand = useRef(inHand);
  useEffect(() => {
    if (lastHand.current === inHand) return;
    lastHand.current = inHand;
    if (view.fishing) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inHand]);

  // Потратилась энергия, пока рыбачит, — другое действие: перечитать.
  const energy = useEnergy().data?.energy;
  const lastEnergy = useRef(energy);
  useEffect(() => {
    const was = lastEnergy.current;
    lastEnergy.current = energy;
    if (view.fishing && energy != null && was != null && energy < was) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energy]);

  const put = (res: FishView) => {
    qc.setQueryData(FISH_KEY, res);
    invalidateBackpack(qc);
  };
  const start = useMutation({
    mutationFn: (minutes: number) => startFishing({ data: { op: newOpId(), minutes } }),
    onSuccess: put,
    onError: (e: Error) => {
      toast.error(humanError(e));
      reload();
      invalidateBackpack(qc);
    },
  });
  const stop = useMutation({
    mutationFn: () => stopFishing(),
    onSuccess: put,
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return {
    view,
    /** Рыбачит здесь — там, где стоит герой. */
    here: view.fishing && !away,
    /** Когда следующая поимка (часы клиента), null — не рыбачит. */
    dueAt: view.fishing && view.nextInMs !== null ? at + view.nextInMs : null,
    /** Забросить на столько минут (по умолчанию — одна попытка). */
    start: (minutes = 1) => start.mutate(minutes),
    stop: () => stop.mutate(),
    busy: start.isPending || stop.isPending,
  };
}
