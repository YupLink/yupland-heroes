// chips-pack-open — chip pack opening logic (drop table roll + serial insert).
import { pg } from "../db/pg";
import { resolveOpenablePack } from "./chips-pack-fallback";
import { claimChipPackGrant, releaseChipPackGrant } from "./chips-pack-claim";
import { insertChipWithSerial } from "./chips-serial";
import { accountOf } from "./user-shared";
import { ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";
import { secureRandom, secureRandomInt } from "@/lib/secureRandom";

type Picked = {
  collectionId: string | null;
  templateId: string | null;
  level: number;
};

function pickOne(
  items: Array<{
    collectionId?: string | null;
    templateId?: string | null;
    level: number;
    weight: number;
  }>,
  totalWeight: number,
): Picked {
  let r = secureRandom() * totalWeight;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) {
      return {
        collectionId: it.collectionId ?? null,
        templateId: it.templateId ?? null,
        level: it.level,
      };
    }
  }
  const last = items[items.length - 1];
  return {
    collectionId: last.collectionId ?? null,
    templateId: last.templateId ?? null,
    level: last.level,
  };
}

export async function openOneChipPack(wallet: string, grantId: string) {
  const grant = await pg.chipPackGrants.findOne({ id: grantId });
  if (!grant) throw new Error("Пак не найден");
  // Владелец — аккаунт, и проверяем его всегда: совпадение адреса ничего не
  // доказывает — адрес мог переехать к другому игроку.
  if (grant.account_id !== (await accountOf(wallet))) throw new Error("Это не твой пак");
  if (grant.opened_at) throw new Error("Пак уже открыт");

  await claimChipPackGrant(grantId);

  try {
    return await rollChipPack(wallet, grant);
  } catch (e) {
    await releaseChipPackGrant(grantId);
    throw e;
  }
}

type Grant = NonNullable<Awaited<ReturnType<typeof pg.chipPackGrants.findOne>>>;

async function rollChipPack(wallet: string, grant: Grant) {
  // Тренировочный пак острова новичка — свои фишки, не коллекции (§8.47).
  if (grant.chip_pack_id === ISLAND_TRAINING_PACK) {
    const { openTrainingPack } = await import("./beta-raid/island/island-pack");
    return openTrainingPack(wallet, grant);
  }
  // Пак с кончившимся запасом открываем его заменой (её задаёт админ): у
  // игрока на руках может лежать пак, коллекции которого выбрали до него, и
  // без подмены он оставался кирпичом — «открой позже или сообщи админу».
  const openable = await resolveOpenablePack(grant.chip_pack_id);
  if (!openable) {
    throw new Error("Запас всех коллекций пака исчерпан — открой позже или сообщи админу");
  }
  const { pack, items } = openable;
  if (openable.substituted) {
    console.info(
      `[chip-pack] ${grant.chip_pack_id} исчерпан — открываем заменой ${pack.id} (грант ${grant.id})`,
    );
  }
  const dt = pack.drop_table as {
    slots: number;
    dropTable: Array<{
      collectionId?: string | null;
      templateId?: string | null;
      level: number;
      weight: number;
    }>;
    guarantees?: Array<{ minLevel: number; slotsAtLeast: number }>;
  };

  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  const rolled: Picked[] = [];
  const slots = Math.max(1, dt.slots ?? 3);
  for (let i = 0; i < slots; i++) rolled.push(pickOne(items, totalWeight));

  for (const g of dt.guarantees ?? []) {
    const have = rolled.filter((p) => p.level >= g.minLevel).length;
    const need = Math.min(g.slotsAtLeast, slots) - have;
    if (need <= 0) continue;
    const targetItems = items.filter((it) => it.level >= g.minLevel);
    if (targetItems.length === 0) continue;
    const targetTotal = targetItems.reduce((s, it) => s + it.weight, 0);
    const pickTarget = (): Picked => pickOne(targetItems, targetTotal);
    const indicesByLevelAsc = rolled
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => a.p.level - b.p.level)
      .map((x) => x.idx);
    for (let k = 0; k < need; k++) rolled[indicesByLevelAsc[k]] = pickTarget();
  }

  const resolved: Picked[] = [];
  for (const p of rolled) {
    if (p.templateId) {
      resolved.push(p);
      continue;
    }
    if (!p.collectionId) continue;
    const { data: candidates } = await pg.chipTemplates
      .raw()
      .select("id,collection_id")
      .eq("collection_id", p.collectionId);
    const list = (candidates ?? []) as Array<{ id: string; collection_id: string }>;
    if (list.length === 0) continue;
    const picked = list[secureRandomInt(0, list.length)];
    resolved.push({ collectionId: picked.collection_id, templateId: picked.id, level: p.level });
  }

  const nowIso = new Date().toISOString();
  const collectionIdsForSerial = Array.from(
    new Set(resolved.map((p) => p.collectionId).filter((x): x is string => !!x)),
  );
  const supplyById = new Map<string, number>();
  if (collectionIdsForSerial.length > 0) {
    const { data: colRows } = await pg.chipCollections
      .raw()
      .select("id, initial_supply")
      .in("id", collectionIdsForSerial);
    for (const c of (colRows ?? []) as Array<{ id: string; initial_supply: number }>) {
      supplyById.set(c.id, c.initial_supply);
    }
  }

  const inserted: typeof resolved = [];
  for (const p of resolved) {
    if (!p.collectionId || !p.templateId) continue;
    const supply = supplyById.get(p.collectionId) ?? 0;
    let serial: number | null = null;
    for (let tryN = 0; tryN < 3 && serial == null; tryN++) {
      try {
        serial = await insertChipWithSerial({
          wallet,
          collectionId: p.collectionId,
          templateId: p.templateId,
          level: p.level,
          grantId: grant.id,
          supply,
          nowIso,
        });
      } catch (e) {
        console.warn(
          `[openChipPack] insert throw (try ${tryN}): `,
          e instanceof Error ? e.message : e,
        );
        serial = null;
      }
    }
    if (serial == null) {
      console.warn(`[openChipPack] слот не выдан после ретраев (распродано?): ${p.collectionId}`);
      continue;
    }
    inserted.push(p);
  }
  if (inserted.length === 0) throw new Error("Не удалось открыть пак — попробуй ещё раз");

  // КОНТРОЛЬ: показываем ровно то, что реально лежит в инвентаре.
  // Раньше окно «Выпало N фишек» строилось по намерению вставить, и при
  // тихом сбое вставки игрок видел 3 фишки, а получал 1 — за свои DARAI.
  const { data: realRows } = await pg.userChipInventory
    .raw()
    .select("template_id, level, collection_id")
    .eq("source_grant_id", grant.id);
  const real = (
    (realRows ?? []) as Array<{
      template_id: string;
      level: number;
      collection_id: string;
    }>
  ).map((r) => ({
    collectionId: r.collection_id,
    templateId: r.template_id,
    level: Number(r.level),
  }));
  if (real.length !== inserted.length) {
    console.warn(
      `[openChipPack] расхождение выдачи: намеревались ${inserted.length}, в инвентаре ${real.length} (grant ${grant.id})`,
    );
  }
  const confirmed = real.length > 0 ? real : inserted;

  await pg.chipPackGrants.update({ id: grant.id }, { opened_at: nowIso, result_chips: confirmed });

  const templateIds = Array.from(
    new Set(confirmed.map((p) => p.templateId).filter((x): x is string => !!x)),
  );
  const { data: tplRows } = await pg.chipTemplates
    .raw()
    .select("id,name,image_url,collection_id")
    .in("id", templateIds);
  const tplMap = new Map(
    (
      (tplRows ?? []) as Array<{
        id: string;
        name: string;
        image_url: string;
        collection_id: string;
      }>
    ).map((t) => [t.id, t]),
  );
  const collectionIds = Array.from(
    new Set(Array.from(tplMap.values()).map((t) => t.collection_id)),
  );
  const { data: colRows } = await pg.chipCollections
    .raw()
    .select("id,name")
    .in("id", collectionIds);
  const colMap = new Map(
    ((colRows ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  return confirmed.map((p) => {
    const tpl = p.templateId ? tplMap.get(p.templateId) : null;
    return {
      collectionId: p.collectionId,
      templateId: p.templateId,
      level: p.level,
      templateName: tpl?.name ?? "Фишка",
      imageUrl: tpl?.image_url ?? "",
      collectionName: tpl ? (colMap.get(tpl.collection_id) ?? "Коллекция") : "Коллекция",
    };
  });
}
