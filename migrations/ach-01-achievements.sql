-- Ачивки (§8.57), 17.10.2026. Владелец: «8 видов ачивок, на 6 редкостей,
-- промежуточные ступени; награды — усиления характеристик; старые ачивки
-- портала наградить, пометить как старые и перенести в аккаунт — портал
-- дальше можно не тянуть».
--  • account_achievement — счётчик занятия на аккаунт (рубка, кристаллы,
--    боссы, клады, рыба, плавание, туман, шахты); пишет сервер игры.
--  • portal_achievement / account_portal_achievement — копия ачивок портала
--    (public.*) в схему игры: каталог и кто что получил (по кошелькам
--    профиля портала → аккаунт игры; сёстры одного аккаунта — вместе).
-- Накатывать ДО кода: код читает и пишет эти таблицы.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.account_achievement (
  account_id text NOT NULL,
  track text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, track)
);

CREATE TABLE IF NOT EXISTS yuplink.portal_achievement (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  points integer,
  category text,
  difficulty text
);

CREATE TABLE IF NOT EXISTS yuplink.account_portal_achievement (
  account_id text NOT NULL,
  achievement_id uuid NOT NULL REFERENCES yuplink.portal_achievement(id),
  earned_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, achievement_id)
);

INSERT INTO yuplink.portal_achievement (id, name, description, icon, points, category, difficulty)
SELECT id, name, description, icon, points, category, difficulty FROM public.achievements
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
      points = EXCLUDED.points, category = EXCLUDED.category, difficulty = EXCLUDED.difficulty;

INSERT INTO yuplink.account_portal_achievement (account_id, achievement_id, earned_at)
SELECT u.account_id, ua.achievement_id, min(ua.earned_at)
  FROM public.user_achievements ua
  JOIN public.profiles p ON p.id = ua.user_id
  JOIN yuplink.users u ON u.wallet = p.near_account_id
 WHERE u.account_id IS NOT NULL
 GROUP BY u.account_id, ua.achievement_id
ON CONFLICT (account_id, achievement_id) DO NOTHING;

COMMIT;
