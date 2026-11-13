// Шаги маршрута наперёд (владелец, 26.10.2026: «просчитывать наперёд — очень годное
// решение»). Раньше каждый шаг ждал ответа сервера: на телефоне с пингом 200 мс герой
// шёл не быстрее сети, как бы быстро ни бежала анимация. Теперь две дорожки:
//
//  · запросы — пачка шагов (move-steps) уходит, пока герой бежит по уже принятым;
//    сервер впереди фигурки не больше чем на «окно» шагов, чтобы «Стоп» не уводил
//    героя далеко;
//  · анимация — шаг за шагом в темпе коня, только по принятым сервером шагам: отказ
//    (кончилась энергия, клетку заняли) — герой стоит на последнем принятом, без
//    отката назад.
//
// Размер пачки — от замеренного пинга: пачка должна успеть вернуться, пока бегут
// предыдущие. «Стоп» — новые пачки не уходят; что сервер уже принял, фигурка добегает
// (герой уже там) — это не больше окна, обычно 1–4 шага.
//
// Модуль чистый: сеть, сон и часы приходят снаружи — так его гоняют тесты.

/** Больше за раз не шлём (сервер принимает до 8). */
export const MAX_CHUNK = 8;
/** Пинг до первого замера, мс. */
const FIRST_RTT_MS = 150;

/** Сколько шагов в пачке: столько, чтобы ответ успевал, пока бегут предыдущие (1–4). */
export function chunkSize(rttMs: number, stepMs: number): number {
  return Math.max(1, Math.min(4, Math.ceil((rttMs + 30) / Math.max(30, stepMs))));
}

export type PipeSend<R> = (from: number, count: number) => Promise<{ ok: R[]; error: unknown }>;

export type PipeOpts<R> = {
  total: number;
  stepMs: number;
  /** Отправить шаги [from, from + count): принятые по порядку и отказ (null — все). */
  send: PipeSend<R>;
  /** Сервер принял шаг i — энергия, побеги, плата двери. */
  onConfirm: (i: number, res: R) => void;
  /** Фигурка шагает на клетку i. */
  onAnimate: (i: number) => void;
  /** Нажали «Стоп» / экран ушёл: новых пачек не шлём. */
  stopped: () => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type PipeEnd = {
  /** Сколько шагов фигурка прошла (= принято сервером, если не было обрыва связи). */
  animated: number;
  confirmed: number;
  /** Отказ сервера или обрыв связи; null — всё прошло. */
  error: unknown;
};

/** Ждать, пока откроют; открыть — разбудить ждущего (условие он проверит сам). */
function latch() {
  let wake: (() => void) | null = null;
  return {
    wait: () => new Promise<void>((res) => (wake = res)),
    open: () => {
      const f = wake;
      wake = null;
      f?.();
    },
  };
}

export async function runPipeline<R>(o: PipeOpts<R>): Promise<PipeEnd> {
  let confirmed = 0;
  let animated = 0;
  let error: unknown = null;
  let sending = true;
  /** Анимация оборвалась (сбой кэша) — новых пачек не шлём. */
  let quit = false;
  const toAnimator = latch();
  const toSender = latch();

  const sender = (async () => {
    let rtt = FIRST_RTT_MS;
    try {
      while (error == null && confirmed < o.total && !o.stopped() && !quit) {
        const c = chunkSize(rtt, o.stepMs);
        const left = o.total - confirmed;
        const room = Math.min(2 * c - (confirmed - animated), left);
        // Ждём, пока освободится целая пачка (или это хвост маршрута): по одному шагу
        // запросы шли бы со скоростью сети, а не коня.
        if (room < Math.min(c, left)) {
          await toSender.wait();
          continue;
        }
        const t0 = o.now();
        let res: { ok: R[]; error: unknown };
        try {
          res = await o.send(confirmed, Math.min(room, MAX_CHUNK));
        } catch (e) {
          error = e ?? new Error("send failed");
          break;
        }
        // Сеть просела — пачка растёт сразу; полегчало — уменьшается плавно.
        const took = o.now() - t0;
        rtt = took > rtt ? took : rtt * 0.7 + took * 0.3;
        for (const r of res.ok) o.onConfirm(confirmed++, r);
        if (res.error != null) error = res.error;
        toAnimator.open();
      }
    } catch (e) {
      // Сбой разбора ответа (кэш, побеги) — тоже конец пути, а не вечное «идём».
      error = e ?? new Error("confirm failed");
    } finally {
      sending = false;
      toAnimator.open();
    }
  })();

  try {
    for (let i = 0; i < o.total; i++) {
      while (i >= confirmed && sending) await toAnimator.wait();
      if (i >= confirmed) break;
      o.onAnimate(i);
      await o.sleep(o.stepMs);
      animated = i + 1;
      toSender.open();
    }
  } finally {
    quit = true;
    toSender.open();
  }
  await sender;
  return { animated, confirmed, error };
}
