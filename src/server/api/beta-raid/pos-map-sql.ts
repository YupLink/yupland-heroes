// Карта позиции игрока в SQL.
//
// Пустая карта у позиции (строки до мультикарты и шаги, записанные без неё) —
// главный мир: так её читает playerMapId. Раньше пустую читали как «любая
// карта», и с открытием этажей игроки главного мира стояли лагерями на всех
// этажах сразу (жалоба 07.10.2026: «накладка миров»).
//
// Модуль без импортов: его берут и сборщики SQL, которые гоняют тестами.

/** Главный мир — карта из settings.beta_raid_map. */
export const MAIN_MAP_SQL = `(SELECT (s.value::jsonb)->>'mapId' FROM yuplink.settings s WHERE s.key = 'beta_raid_map')`;

/** Карта позиции `p` (алиас строки beta_raid_positions): пустая — главный мир. */
export const POS_MAP_SQL = (p: string): string => `COALESCE(${p}.map_id, ${MAIN_MAP_SQL})`;
