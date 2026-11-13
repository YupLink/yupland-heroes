-- ЗАПУСК поломки и ремонта артефактов для игроков (ПРАВИЛА §8.63 п.3, §8.72).
-- Запускать ТОЛЬКО по слову владельца. До этого механика видна одним админам.
--
-- Владелец, 23.10.2026: «Нужно, чтобы арт слетал с героя в арты — на нём сверху
-- изображение, будто он сломан, поверх накладка, и надеть не давало бы
-- возможности. … В кузнице кнопка для починки — отдельная вкладка».
--
-- Что делает, одной транзакцией:
--   1. Снимает ВСЕ сломанные артефакты (износ 100) со всех героев — те же
--      правила, что при поломке в ударе (art-wear-hit.ts): из equipped уходит
--      только сломанный, предмет остаётся в инвентаре (арты), остальное надетое
--      не трогаем. Герои в залоге рынка героев (счёт '_hero_market') — тоже:
--      артефакты лота едут покупателю/продавцу списком лота, надетым не будут.
--   2. Пишет событие поломки (art_break_notice) владельцу каждого снятого
--      предмета — при входе на карту у него всплывёт плашка «Сломан: <имя>».
--      Залогу рынка событий не пишем (это не игрок).
--   3. Ставит settings.art_repair_open = 'true': ремонт в кузнице (вкладка
--      «Ремонт»), запрет надеть сломанный, накладка и снятие при поломке — у
--      всех игроков. Код читает флаг с кэшем 2 с — без выката.
--
-- Идемпотентен: повтор ничего не задвоит — сломанного на героях уже нет, ключ
-- события 'abn_launch_<предмет>', флаг уже 'true'. Нужны: art-broken-01.sql
-- (таблица событий) и выкаченный код ветки art/broken-unequip.
-- На 23.10.2026 (прод, SELECT): сломанных 58, надетых из них 18 — на 5 героях
-- 5 аккаунтов; один предмет на двух героях сразу — ни разу.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Таблицы событий нет — миграция art-broken-01 не накатана: падаем до записей.
DO $$
BEGIN
  IF to_regclass('yuplink.art_break_notice') IS NULL THEN
    RAISE EXCEPTION 'нет таблицы yuplink.art_break_notice — сначала migrations/art-broken-01.sql';
  END IF;
END $$;

WITH broken AS (
  SELECT u.id, u.account_id, u.template_id, t.name, t.image_url
    FROM yuplink.user_game_item u
    LEFT JOIN yuplink.mystic_item_template t ON t.id = u.template_id
   WHERE u.kind = 'artifact' AND u.wear >= 100
),
-- Надетые сломанные: по одной строке на предмет (герой — основной первым).
worn AS (
  SELECT DISTINCT ON (b.id) b.id, b.account_id, b.template_id, b.name, b.image_url,
         h.id AS hero_id
    FROM yuplink.hero_instance h
    CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(h.equipped::jsonb) = 'object'
                                            THEN h.equipped::jsonb ELSE '{}'::jsonb END) e
    JOIN broken b ON b.id = e.value
   ORDER BY b.id, h.selected_at DESC NULLS LAST, h.id
),
note AS (
  INSERT INTO yuplink.art_break_notice
         (id, account_id, item_id, template_id, name, image_url, hero_id)
  SELECT 'abn_launch_' || w.id, w.account_id, w.id, w.template_id, w.name, w.image_url,
         w.hero_id
    FROM worn w
   WHERE w.account_id IS NOT NULL AND w.account_id <> '_hero_market'
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
strip AS (
  UPDATE yuplink.hero_instance h
     SET equipped = COALESCE((
           SELECT jsonb_object_agg(e.key, e.value)
             FROM jsonb_each_text(h.equipped::jsonb) e
            WHERE e.value NOT IN (SELECT id FROM broken)
         ), '{}'::jsonb),
         updated_at = now()
   WHERE jsonb_typeof(h.equipped::jsonb) = 'object'
     AND EXISTS (
       SELECT 1
         FROM jsonb_each_text(CASE WHEN jsonb_typeof(h.equipped::jsonb) = 'object'
                                   THEN h.equipped::jsonb ELSE '{}'::jsonb END) x
        WHERE x.value IN (SELECT id FROM broken)
     )
  RETURNING h.id
)
SELECT (SELECT count(*) FROM worn)  AS broken_worn,
       (SELECT count(*) FROM strip) AS heroes_stripped,
       (SELECT count(*) FROM note)  AS notices_written;

INSERT INTO yuplink.settings (key, value) VALUES ('art_repair_open', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true';

COMMIT;
