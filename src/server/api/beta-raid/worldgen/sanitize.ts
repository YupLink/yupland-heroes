// Награда объекта, снятая с образца, — без денег.
//
// У босса и сундука образца в настройке лежит награда (rewardConfig). Токены
// (Darai, GDarai, USDT) на образце обеспечены пулом карты — распиской на
// клетке (darai_ref/darai_hold), и копия без расписки печатала бы токены из
// воздуха. Предметы и паки — штучные призы, которые админ ставил руками. Новому
// миру достаётся остальное: лайки, ресурсы, свои товары — как у раздачи.
// Токены и предметы в новый мир ставит админ, сам и с обеспечением.

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export function cleanObjectConfig(cfg: unknown): unknown {
  if (!isObj(cfg)) return null;
  const reward = cfg.rewardConfig;
  if (!isObj(reward)) return { ...cfg };
  const fillers = Array.isArray(reward.fillers)
    ? reward.fillers.filter((f) => isObj(f) && f.kind !== "token")
    : [];
  return { ...cfg, rewardConfig: { ...reward, items: [], packs: [], fillers } };
}
