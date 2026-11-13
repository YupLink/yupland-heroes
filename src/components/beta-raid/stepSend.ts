// Отправка шагов героя на сервер и что сделать с ответом. Вынесено из useBetaMovement
// (лимит строк):
//  · sendStep — один шаг, как было всегда (маршрут с кораблём: лоцман судна ведёт
//    борт шаг за шагом), в прежнем темпе 190 мс;
//  · walkLand — путь по суше пачками наперёд (routePipeline, move-steps, §8.84) в темпе
//    коня: фигурка бежит по принятым шагам, сеть не ждёт.
// Ответ шага одинаково правит кэш: энергия и сытость с сервера, побеги, плата двери.
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moveBetaRaid, moveBetaRaidSteps } from "@/server/api/beta-raid";
import type { PortalPrice } from "@/lib/portal";
import { BASE_STEP_MS } from "@/lib/hero/mount";
import { stepSatietyCost } from "@/lib/hero/satiety";
import { scaleSatiety } from "@/lib/raid/island/satiety";
import { serverErrorText } from "@/lib/serverErrorText";
import { announceToll } from "./gateToll";
import { applyFled, type FleeMove } from "./applyFled";
import { emitFlee } from "./fleeFlash";
import { revealFled } from "./fleeReveal";
import { isOceanCell, isWaterCell, type TerrainInfo } from "./hexStepCost";
import { runPipeline } from "./routePipeline";
import type { makeStepCache } from "./stepCache";
import type { Cell } from "./unpackMap";

type Step = { q: number; r: number; cost: number };
type T = (key: string, params?: Record<string, string | number>) => string;
type StepRes = {
  remainingEnergy?: number;
  satiety?: { now: number; max: number; hungry: boolean } | null;
  fled?: FleeMove[];
  toll?: PortalPrice[];
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeStepSend(o: {
  qc: QueryClient;
  cache: ReturnType<typeof makeStepCache>;
  t: T;
  satietyMult: number;
  cells: Record<string, Cell> | undefined;
  terrains: Record<string, TerrainInfo> | undefined;
}) {
  const { qc, cache, t } = o;
  /** Вода ли клетка, куда ведёт шаг. */
  const stepOnWater = (step: Step): boolean =>
    isWaterCell(o.cells?.[`${step.q},${step.r}`], o.terrains ?? {});
  /** Океан ли — шаг туда стоит герою больше сытости (lib/hero/satiety). */
  const stepOnOcean = (step: Step): boolean =>
    isOceanCell(o.cells?.[`${step.q},${step.r}`], o.terrains ?? {});

  /** Ответ сервера на шаг: энергия, сытость, побеги, плата двери. */
  const settle = (step: Step, res: StepRes | undefined) => {
    if (typeof res?.remainingEnergy === "number") cache.applyServerEnergy(res.remainingEnergy);
    if (res?.satiety) cache.applyServerSatiety(res.satiety);
    // От нашего шага кто-то отбежал (server flee-move). Карту правим ЗДЕСЬ,
    // а не по живому потоку: сразу после шага экран решает, с чем игрок
    // взаимодействует, и решать он должен по уже переехавшей цели.
    applyFled(qc, res?.fled);
    // Вспышку показываем по СЫРОМУ списку побегов, а не по отфильтрованному
    // applyFled: беглец мог уйти из-под объекта под другой объект (не виден ни
    // до, ни после) — карта не меняется, но «куда убежал» показать всё равно надо.
    emitFlee(res?.fled);
    revealFled(step, res?.fled); // видел, откуда убежал, — видит и куда (fleeReveal)
    announceToll(qc, res?.toll, t);
  };

  /**
   * Один шаг: рисуем сразу, запрос идёт параллельно анимации.
   * Возвращает false, если сервер шаг не принял.
   */
  const sendStep = async (step: Step, big = false): Promise<boolean> => {
    const snapshot = cache.snapshot();
    cache.applyStep(
      step.q,
      step.r,
      step.cost,
      scaleSatiety(
        stepSatietyCost({ water: stepOnWater(step), ocean: stepOnOcean(step) }),
        o.satietyMult,
      ),
    );
    try {
      const [res] = await Promise.all([
        moveBetaRaid({
          data: { q: step.q, r: step.r, ...(big ? { big } : {}) },
        }) as Promise<StepRes>,
        sleep(BASE_STEP_MS),
      ]);
      settle(step, res);
      return true;
    } catch (e) {
      cache.rollback(snapshot);
      toast.error(serverErrorText(e, t, t("braid.move_failed")));
      return false;
    }
  };

  /**
   * Путь по суше наперёд. Фигурка встаёт на клетку, только когда сервер шаг принял —
   * энергия и сытость приходят его числами, догадка не нужна. true — весь путь пройден.
   */
  const walkLand = async (steps: Step[], stepMs: number, stopped: () => boolean) => {
    const end = await runPipeline<StepRes>({
      total: steps.length,
      stepMs,
      now: () => performance.now(),
      sleep,
      stopped,
      send: async (from, count) => {
        const chunk = steps.slice(from, from + count).map(({ q, r }) => ({ q, r }));
        const res = (await moveBetaRaidSteps({ data: { steps: chunk } })) as {
          results?: StepRes[];
          error?: string | null;
        };
        return { ok: res?.results ?? [], error: res?.error ? new Error(res.error) : null };
      },
      onConfirm: (i, res) => settle(steps[i], res),
      onAnimate: (i) => cache.applyStep(steps[i].q, steps[i].r, 0, 0),
    });
    if (end.error) toast.error(serverErrorText(end.error, t, t("braid.move_failed")));
    return end.animated === steps.length && end.error == null;
  };

  return { sendStep, walkLand, stepOnWater };
}
