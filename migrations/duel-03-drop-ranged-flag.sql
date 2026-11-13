-- Дуэль героев: флажок «стреляет» заменён дальностью удара (duel-02, duel_range).
-- Накатывать ПОСЛЕ выката кода, который читает duel_range (старый читал duel_ranged).
ALTER TABLE yuplink.raid_boss_template DROP COLUMN IF EXISTS duel_ranged;
