-- Меню входа «Начать игру» (Архан через владельца, 22.10.2026, задача #497194:
-- «ты заходишь — менюшка, старт игры; на старте даёт выбрать расу одного из шести
-- героев»). Новичок выбирает расу, и обычный герой этой расы ложится стартовым
-- (starter-kit.ts grantStarterHero, source 'starter'). Отметка здесь — «игру
-- начал»: пишется той же вставкой, что и герой, и делает выбор разовым на
-- аккаунт — продал или сдал всех героев, а второго бесплатного не получишь.
--
-- Новичок = нет строки здесь И нет ни одного героя (ни предметом, ни экземпляром).
-- Отмечаем всех, у кого герой уже есть (на 22.10 — все 600 аккаунтов): они играют,
-- им «Продолжить». Аккаунты без героя не трогаем — им как раз выбирать.
--
-- ПРИМЕНЯТЬ СТРОГО ДО КОДА: без таблицы новый код не покажет меню и не выдаст
-- героя (новичок войдёт без героя).
-- ПОСЛЕ ВЫКАТА КОДА — ПОВТОРИТЬ блок «Заполнение отметок» (он повторяемый,
-- ON CONFLICT DO NOTHING): между миграцией и выкатом старый код выдавал героя при
-- создании аккаунта без отметки. Повтор всего файла тоже безвреден.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.game_start (
  account_id  text PRIMARY KEY,
  -- Выбранный герой (шаблон); NULL — отмечен разово как уже игравший.
  template_id text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Владелец — как у всей схемы: приложение ходит под supabase_admin.
ALTER TABLE yuplink.game_start OWNER TO supabase_admin;

-- Заполнение отметок (повторяемый запрос).
INSERT INTO yuplink.game_start (account_id)
SELECT g.account_id FROM yuplink.user_game_item g
 WHERE g.kind = 'hero' AND g.account_id IS NOT NULL
UNION
SELECT h.account_id FROM yuplink.hero_instance h
 WHERE h.account_id IS NOT NULL
ON CONFLICT (account_id) DO NOTHING;

COMMIT;
