-- Потолок выноса с острова (владелец, 06.11.2026, ПРАВИЛА §8.113).
-- res_base — ресурсы аккаунта на старте острова; exit_cut — что срезано на выходе порталом.
-- Накатывать ДО кода: создание острова пишет res_base.
ALTER TABLE yuplink.raid_island ADD COLUMN IF NOT EXISTS res_base jsonb;
ALTER TABLE yuplink.raid_island ADD COLUMN IF NOT EXISTS exit_cut jsonb;
