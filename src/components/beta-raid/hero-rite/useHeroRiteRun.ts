// «Зачаровать» героев: один запрос на нажатие. opId — новый на КАЖДОЕ нажатие
// (мост к базе повторяет запрос вслепую — сервер по ключу не спишет второй раз).
// После ответа — всё, что задел обряд, перечитывается без F5.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runHeroRite } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import type { HeroRiteResult } from "@/lib/enchant/heroRite";
import {
  HERO_RITE_HEROES_KEY,
  heroRiteKey,
  invalidateAfterRite,
  type RiteAt,
} from "@/components/beta-raid/hero-rite/heroRiteQueries";

export type RiteTry = { riteId: string; heroIds: string[] };

/** Тело запроса — отдельно, чтобы тест видел форму без React. */
export function riteCall(at: RiteAt, v: RiteTry): Promise<HeroRiteResult> {
  return runHeroRite({ data: { ...at, ...v, opId: newOpId() } });
}

export function useHeroRiteRun(at: RiteAt, onResult: (res: HeroRiteResult) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: RiteTry) => riteCall(at, v),
    onSuccess: (res) => {
      onResult(res);
      invalidateAfterRite(qc, at);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // Отказ мог быть из-за устаревшего окна (обряд поменяли, герой занят) —
      // перечитываем; ничего не списано.
      void qc.invalidateQueries({ queryKey: heroRiteKey(at) });
      void qc.invalidateQueries({ queryKey: HERO_RITE_HEROES_KEY });
    },
  });
}
