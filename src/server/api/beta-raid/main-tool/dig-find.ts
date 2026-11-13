// Выкопанное лопатой (ПРАВИЛА §8.24 п. 6б): «находка — мешочком — нужно
// открывать самому, за энергию; при открытии — выкопано» (владелец, 31.10.2026).
// Мешочек (§8.21) — на клетке копки, в ямке, мимо рюкзака; источник 'dig' —
// окно мешочка по нему говорит «Выкопано: …» при «Открыть» (§8.23, 1⚡). Мешочек
// не упал (сбой базы) — в «Добычу»: находка не пропадает. Метка — «собрано».
//
// Роняет только тот вызов, чья запись ключа нажатия легла (ground-dig, mine):
// повтор нажатия и дубль — только ответ. Ключ выпадения — ключ нажатия и nonce
// записавшего: id мешочка от ключа, повтор моста второй не уронит. Упал процесс
// между записью ключа и выдачей — находка не выдана (размен против двойной).
import type { DropItem } from "@/server/api/beta-raid/loot-bag/bag-deliver";

export async function giveFind(o: {
  account: string;
  mapId: string;
  q: number;
  r: number;
  /** Ключ нажатия `gdig:<аккаунт>:<op>`. */
  op: string;
  /** nonce вызова, записавшего ключ нажатия. */
  nonce: string;
  itemId: string;
}): Promise<void> {
  const [{ deliverOrDrop, queueKey }, { queueEncounterReward }] = await Promise.all([
    import("@/server/api/beta-raid/loot-bag/bag-deliver"),
    import("@/server/api/beta-raid/reward-queue"),
  ]);
  const item: DropItem = { itemId: o.itemId, amount: 1, origin: "loot" };
  const key = `dig:${o.op}:${o.nonce}`;
  const toQueue = (it: DropItem, k: string) =>
    queueEncounterReward({
      account: o.account,
      mapId: o.mapId,
      cycleNo: 0,
      sourceName: "Лопата",
      kind: "custom",
      amount: it.amount,
      packId: it.itemId,
      origin: "loot",
      key: k,
    });
  try {
    await deliverOrDrop({
      owner: o.account,
      account: o.account,
      items: [item],
      at: { key, mapId: o.mapId, q: o.q, r: o.r, source: "dig", sourceName: "Лопата" },
      toQueue,
      bagOnly: true,
    });
  } catch (e) {
    // Ничего не упало (сбой до первой записи) — в «Добычу» тем же ключом строки.
    console.warn("[dig] находка — в «Добычу»:", key, e instanceof Error ? e.message : e);
    await toQueue(item, queueKey(key, 0)).catch((err: unknown) =>
      console.error("[dig] находка не встала в «Добычу»:", key, o.itemId, err),
    );
  }
}
