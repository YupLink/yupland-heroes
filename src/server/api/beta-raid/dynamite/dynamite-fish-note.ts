// Улов динамитом — в журнал улова и турнир рыбаков (владелец, 30.10.2026: «да, добавь в
// турнир и журнал»). Каждая всплывшая рыба — улов бросившего, лёгший мешочком на клетке
// воды: как рыба удочки, что не влезла в рюкзак (строка «put» с клеткой мешочка, очко
// «Улова»). Башмак — не улов («Упс, показалось»). Ключ — `dynfish:<ключ броска>:<q>:<r>`,
// тот же, что у мешочка: повтор нажатия не задваивает. Как весь журнал — без исключений.
import { FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";
import { noteCatch } from "@/server/api/beta-raid/fishing/fishing-note";
import type { BlastFish, BlastFishIn } from "./dynamite-bag-items";

export async function noteDynamiteCatch(o: {
  account: string;
  mapId: string;
  /** Ключ броска (dyn:<аккаунт>:<op>). */
  op: string;
  /** Что сервер бросил под взрыв (blastFish). */
  fishIn: readonly BlastFishIn[];
  /** Что база действительно положила (итог взрыва). */
  spawned: readonly BlastFish[];
}): Promise<void> {
  const at = Date.now();
  for (const f of o.spawned) {
    const src = o.fishIn.find((x) => x.q === f.q && x.r === f.r);
    const items = (src?.items ?? []).filter(
      (it) => it.k !== FISH_BOOT_KEY && !!it.item && it.n > 0,
    );
    if (items.length === 0) continue;
    await noteCatch({
      account: o.account,
      mapId: o.mapId,
      q: f.q,
      r: f.r,
      key: `dynfish:${o.op}:${f.q}:${f.r}`,
      items: items.map((it) => ({
        itemId: it.item as string,
        name: it.name,
        n: it.n,
        dropped: it.n,
      })),
      times: items.flatMap((it) => Array.from({ length: it.n }, () => at)),
    });
  }
}
