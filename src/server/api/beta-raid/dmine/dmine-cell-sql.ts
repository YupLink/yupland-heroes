// Клетка — гриб любого вида (DARAI, золотой, алмазный), в SQL: то же правило,
// что lib/mushroomKinds.mushroomKindOf — функция базы yuplink.raid_mushroom_kind
// (migrations/mushroom-03). Охрану на такую не ставят (mine-guard-claim).

/** Настройка клетки c (raid_map_cells) — гриб. */
export const mushroomCellSql = (c: string): string =>
  `(yuplink.raid_mushroom_kind(${c}.building_config) IS NOT NULL)`;
