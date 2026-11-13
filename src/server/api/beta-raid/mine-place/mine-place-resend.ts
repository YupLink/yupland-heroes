// Досылка поставленных шахт (ПРАВИЛА §8.59.8): раз в минуту в каждом процессе,
// стартует с отдачей снимка карты (map-serve), как decor-respawn.
//
// Ключ нажатия без sent_at старше 30 с — рассылка после коммита не дошла
// (сбой моста, лок строки карты, упавший процесс): шлём дельту клетки ещё раз
// и отмечаем ключ (mine-place-announce). Без досылки шахта осталась бы
// невидимой стеной: сервер шаг не пускает, а карта игрока её не знает.
// Процессов бывает два — дошлют дважды, это безвредно.
import { mcpExec } from "@/server/db/mcpClient";
import { announcePlaced, placedOpOf } from "@/server/api/beta-raid/mine-place/mine-place-announce";
import {
  placeSentSql,
  placeUnsentSql,
  type PlaceOpRow,
} from "@/server/api/beta-raid/mine-place/mine-place-op-sql";

const EVERY_MS = 60_000;

/** Один проход: дослать неразосланные. Отдаёт, сколько ключей закрыто. */
export async function resendPlacedMines(): Promise<number> {
  const rows = ((await mcpExec(placeUnsentSql(), { wrapJson: true })) ?? []) as PlaceOpRow[];
  let done = 0;
  for (const row of rows) {
    const p = placedOpOf(row);
    // Вид не из ставящихся — слать нечего; отметка, чтобы не стоял в голове очереди.
    if (!p) await mcpExec(placeSentSql(String(row.op))).catch(() => {});
    else if (await announcePlaced(p)) done += 1;
  }
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await resendPlacedMines();
  } catch (e) {
    console.warn("[mine-place] досылка не удалась:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить досылку в этом процессе: раз в минуту, первый проход — сразу. */
export function startMinePlaceResender(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
