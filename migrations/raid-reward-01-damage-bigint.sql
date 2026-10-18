-- Урон в награде — bigint, как у самого боя (03.10.2026).
--
-- beta_raid_object_run.damage и запас HP объекта давно bigint, а копия урона в
-- raid_reward осталась integer. «Лесной Бог» живёт на 10 млрд HP: у первого
-- места сумма урона больше 2 147 483 647, INSERT награды падал с «integer out
-- of range», а раздача (encounter-payout, give) глотала ошибку в console.warn.
-- С 26.09 первое место за этого босса не получало ничего.
--
-- Колонка справочная: её никто не читает в расчётах, только пишет. Таблица
-- ~330 тыс. строк / 81 МБ — перезапись идёт секунды под эксклюзивным локом;
-- lock_timeout не даёт встать в очередь за долгой транзакцией и подвесить
-- выдачу наград. Старые chip_boss_run/chip_boss_reward не трогаем: урон там
-- до 2 млн, а читатели ждут number (node-pg отдаёт bigint строкой).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE yuplink.raid_reward ALTER COLUMN damage TYPE bigint;

COMMIT;
