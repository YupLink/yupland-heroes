-- Город = ратуша + привязанные лавки (владелец, 04.10.2026). Накатывать ДО кода.
--
-- Зону города (краска клеток town_zone + привязка клеток цепочкой к ратуше)
-- упразднили: лавка привязывается к ратуше галочкой в своей настройке и
-- выбором ратуши из списка (town-binding.ts). Привязка — две колонки лавки.
-- Краску зоны стираем сразу: старый код до выката её ещё рисует, а нового
-- смысла у неё нет (на 04.10: 5 покрашенных клеток, привязанных — 0).
-- Колонки зоны удаляет town-09 — ПОСЛЕ выката кода, который их не читает.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_market_shop
  ADD COLUMN IF NOT EXISTS town_q INTEGER,
  ADD COLUMN IF NOT EXISTS town_r INTEGER;

UPDATE yuplink.raid_map_cells
   SET town_zone = false, town_hall_q = NULL, town_hall_r = NULL
 WHERE town_zone OR town_hall_q IS NOT NULL OR town_hall_r IS NOT NULL;

COMMIT;
