-- Зачарование в минус (владелец, 28.10.2026: «от −20 до 50»). Усиление
-- заклинания может начинаться с −99 («-20-50», «-50--20», «-10»), а успех с
-- минусовым процентом — то же зачарование экземпляра: одно на артефакт, статы
-- × (1 + pct/100) вверх. Ниже −99 нельзя: стат не уходит в ноль и минус.
--
-- Ослабляет два CHECK из enchant-01 (имена — как их назвал Postgres, сверено с
-- pg_constraint на проде 28.10):
--   raid_enchant_spell.raid_enchant_spell_boost_min_check: boost_min >= 0 → >= -99
--   item_enchant.item_enchant_pct_check:                   pct >= 0       → >= -99
-- Остальные правила (boost_max >= boost_min и т. д.) не трогаем.
--
-- Накатывать ДО кода: без неё «-20-50» не сохранится (CHECK), а успех с
-- минусом не запишется — попытка вернёт цену (enchant.item_changed).
-- Повторный накат безопасен: DROP ... IF EXISTS + ADD под тем же именем,
-- данных не трогает (сейчас всё ≥ 0 — проходит и новую проверку).
-- Готово, когда pg_get_constraintdef обоих ограничений показывает >= '-99'.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_enchant_spell
  DROP CONSTRAINT IF EXISTS raid_enchant_spell_boost_min_check;
ALTER TABLE yuplink.raid_enchant_spell
  ADD CONSTRAINT raid_enchant_spell_boost_min_check CHECK (boost_min >= -99);

ALTER TABLE yuplink.item_enchant
  DROP CONSTRAINT IF EXISTS item_enchant_pct_check;
ALTER TABLE yuplink.item_enchant
  ADD CONSTRAINT item_enchant_pct_check CHECK (pct >= -99);

COMMIT;
