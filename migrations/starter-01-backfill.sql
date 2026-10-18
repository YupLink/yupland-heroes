-- Стартовый набор задним числом (владелец, 06.10.2026): каждому игроку, у кого
-- нет ни одного героя, — один коммон-герой; у кого меньше 10 фишек (обычные
-- не сожжённые + живые тренировочные) — тренировочные 1–3★ до 10 штук.
-- Новичкам то же самое выдаёт вход в игру (src/server/api/starter-kit.ts,
-- hallway-skip.ts). Игрок = аккаунт, к которому привязана строка users.
-- Повторный прогон ничего не добавит: условия те же «нет героя» / «меньше 10».
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE starter_players ON COMMIT DROP AS
SELECT a.id AS account_id,
       a.telegram_id,
       COALESCE(a.active_wallet,
                (SELECT u.wallet FROM yuplink.users u
                  WHERE u.account_id = a.id ORDER BY u.created_at LIMIT 1)) AS wallet,
       EXISTS (SELECT 1 FROM yuplink.user_game_item g
                WHERE g.account_id = a.id AND g.kind = 'hero')
         OR EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.account_id = a.id) AS has_hero,
       (SELECT count(*) FROM yuplink.user_chip_inventory c
         WHERE c.account_id = a.id AND c.status <> 'burned')
       + (SELECT count(*) FROM yuplink.hallway_training_chips t
           WHERE t.account_id = a.id AND t.consumed_at IS NULL) AS chips
  FROM yuplink.accounts a
 WHERE EXISTS (SELECT 1 FROM yuplink.users u WHERE u.account_id = a.id);

-- Герой: случайный активный коммон (уровень 1) — на каждую строку свой бросок.
WITH tpl AS (
  SELECT array_agg(id ORDER BY id) AS ids
    FROM yuplink.mystic_item_template
   WHERE kind = 'hero' AND active AND level = 1)
INSERT INTO yuplink.user_game_item
  (id, account_id, wallet, template_id, kind, source, obtained_at)
SELECT 'ugi_' || substr(md5(random()::text || p.account_id), 1, 12),
       p.account_id, p.wallet,
       tpl.ids[1 + floor(random() * array_length(tpl.ids, 1))::int],
       'hero', 'starter', now()
  FROM starter_players p, tpl
 WHERE NOT p.has_hero AND p.wallet IS NOT NULL
   AND array_length(tpl.ids, 1) > 0;

-- Фишки: до 10, звезда — как в наборе новичка (1, 1.5, 2, 2.5, 3).
INSERT INTO yuplink.hallway_training_chips
  (id, account_id, wallet, telegram_id, star, source, obtained_at)
SELECT 'htc_' || substr(md5(random()::text || p.account_id || n), 1, 16),
       p.account_id, p.wallet, p.telegram_id,
       (ARRAY[1, 1.5, 2, 2.5, 3])[1 + floor(random() * 5)::int],
       'starter_topup', now()
  FROM starter_players p,
       generate_series(1, GREATEST(0, 10 - p.chips)::int) AS n
 WHERE p.chips < 10 AND p.wallet IS NOT NULL;

COMMIT;
