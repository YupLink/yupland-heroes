-- Обычные герои — «как будто всегда были обычными» (владелец, 22.10.2026: «лайки верни —
-- я полагаю это за каммон героев. уровень тоже верни и редкость тоже поставь каммон —
-- х-ки тоже пусть будут как на 10 лвл»). Продолжение hero-rarity-01-fix (редкость уже common).
--
-- Кто: 56 героев из yuplink.hero_instance_bak_20261022 (их и только их).
-- Что:
--   a) копии до правки: героев → hero_instance_bak_20261022_refund, балансов лайков
--      затронутых аккаунтов → user_like_balance_bak_20261022_refund;
--   b) ЛАЙКИ: возвращаются лайки, заплаченные за ступени с 10-го уровня и выше
--      (10→11 … 21→22) — по журналу трат like_spend_log (ref = id героя, hero_create /
--      hero_levelup). Лестница цен у rare и common ОДНА (heroLevels.LEVEL_COST), поэтому
--      переплаты rare против common за уровни 1–10 нет — ноль. Ступень 10→11 стоит 400,
--      все ступени ниже 10-го дешевле 400, выше — дороже: «amount >= 400» = ступени
--      выше 10-го. Прод 22.10: 10 героев, 10 аккаунтов, 31 400 лайков; журнал сходится
--      с hero_instance.likes_spent у всех 56.
--      Почему по журналу, а не «потрачено − цена обычного до 10-го»: три героя (Cyt…,
--      JTy…, 2BHq…) часть уровней до 10-го взяли деревом уровней (оплата отдельно,
--      building_service) — разность засчитала бы те уровни против возврата (30 060
--      вместо 31 400), то есть взыскала бы их. Здесь возвращается ровно то, что
--      заплачено лайками за отнятые уровни.
--      Начисление — как addLikes (likesAccount.ts): ключ в like_grant_log
--      'hero_rarity_refund:<id героя>' и прибавка available + lifetime_granted
--      в user_like_balance; повтор ключа ничего не начисляет;
--   c) уровень выше 10 → 10; likes_spent героя уменьшается на возврат;
--   d) характеристики «как у обычного 10-го»: статы и так считаются от growthLevel ≤ 10;
--      очков навыков обычному не положено вовсе (skillPointsAt('common', …) = 0) —
--      вложенные снимаются (skills = '{}', прод: 2 героя — {int:1, spd:1} и {atk:1});
--      сытость выше потолка обычного (1000, satiety.ts) — до 1000;
--   e) проверочные SELECT — до COMMIT (проба с ROLLBACK вместо COMMIT их тоже покажет).
-- НЕ трогает: рюкзак/книгу/сумку сверх ёмкости обычного (вещи и выученное — имущество
-- игрока; новое туда и так не примут), оплату дерева уровней.
--
-- Одна транзакция. Повтор безвреден: начисление — по ключу like_grant_log, уровень и
-- likes_spent правятся только у героев выше 10-го уровня (после первого прогона их нет),
-- очки и сытость — только где ещё есть что править, копии дописываются только новыми id.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- Затронутые герои — замок до конца транзакции (прокачка/надевание подождут).
SELECT h.id
  FROM yuplink.hero_instance h
 WHERE h.id IN (SELECT id FROM yuplink.hero_instance_bak_20261022)
   FOR UPDATE OF h;

-- Расчёт возврата по журналу трат (живёт до конца транзакции).
CREATE TEMP TABLE hero_refund_20261022 ON COMMIT DROP AS
SELECT b.id, b.account_id,
       COALESCE(sum(l.amount) FILTER (WHERE l.amount >= 400), 0) AS refund,
       COALESCE(sum(l.amount), 0) AS logged
  FROM yuplink.hero_instance_bak_20261022 b
  LEFT JOIN yuplink.like_spend_log l
         ON l.ref = b.id AND l.reason IN ('hero_create', 'hero_levelup')
 GROUP BY b.id, b.account_id;

-- ───────────── 0) что поменяется (смотреть на пробе) ─────────────
SELECT r.id, r.account_id, h.level, h.likes_spent, r.logged, r.refund,
       h.likes_spent - r.refund AS likes_spent_after, h.skills, h.satiety,
       EXISTS (SELECT 1 FROM yuplink.like_grant_log g
                WHERE g.ref = 'hero_rarity_refund:' || r.id) AS already_refunded
  FROM hero_refund_20261022 r
  JOIN yuplink.hero_instance h ON h.id = r.id
 WHERE r.refund > 0 OR h.level > 10 OR h.skills <> '{}'::jsonb OR h.satiety > 1000
 ORDER BY h.level DESC, r.id;

-- ───────────── a) копии ─────────────
CREATE TABLE IF NOT EXISTS yuplink.hero_instance_bak_20261022_refund AS
  SELECT h.*, now() AS bak_at FROM yuplink.hero_instance h WHERE false;
INSERT INTO yuplink.hero_instance_bak_20261022_refund
SELECT h.*, now()
  FROM yuplink.hero_instance h
 WHERE h.id IN (SELECT id FROM yuplink.hero_instance_bak_20261022)
   AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance_bak_20261022_refund x WHERE x.id = h.id);

CREATE TABLE IF NOT EXISTS yuplink.user_like_balance_bak_20261022_refund AS
  SELECT u.*, now() AS bak_at FROM yuplink.user_like_balance u WHERE false;
INSERT INTO yuplink.user_like_balance_bak_20261022_refund
SELECT u.*, now()
  FROM yuplink.user_like_balance u
 WHERE u.account_id IN (SELECT account_id FROM hero_refund_20261022 WHERE refund > 0)
   AND NOT EXISTS (SELECT 1 FROM yuplink.user_like_balance_bak_20261022_refund x
                    WHERE x.account_id = u.account_id);

-- ───────────── b) возврат лайков (как addLikes, ключ на героя) ─────────────
WITH claim AS (
  INSERT INTO yuplink.like_grant_log (ref, account_id, delta)
  SELECT 'hero_rarity_refund:' || r.id, r.account_id, r.refund
    FROM hero_refund_20261022 r
   WHERE r.refund > 0
  ON CONFLICT (ref) DO NOTHING
  RETURNING account_id, delta
)
INSERT INTO yuplink.user_like_balance
  (account_id, available, last_daily_grant_at,
   lifetime_granted, lifetime_purchased, lifetime_spent, updated_at)
SELECT c.account_id, sum(c.delta), NULL, sum(c.delta), 0, 0, now()
  FROM claim c
 GROUP BY c.account_id
ON CONFLICT (account_id) DO UPDATE
  SET available = yuplink.user_like_balance.available + EXCLUDED.available,
      lifetime_granted = yuplink.user_like_balance.lifetime_granted + EXCLUDED.lifetime_granted,
      updated_at = now();

-- ───────────── c) уровень 10 и likes_spent ─────────────
UPDATE yuplink.hero_instance h
   SET level = 10,
       likes_spent = GREATEST(0, h.likes_spent - r.refund),
       updated_at = now()
  FROM hero_refund_20261022 r
 WHERE r.id = h.id AND h.level > 10;

-- ───────────── d) очки навыков и сытость обычного ─────────────
UPDATE yuplink.hero_instance h
   SET skills = '{}'::jsonb,
       satiety = CASE WHEN h.satiety > 1000 THEN 1000 ELSE h.satiety END,
       updated_at = now()
 WHERE h.id IN (SELECT id FROM yuplink.hero_instance_bak_20261022)
   AND (h.skills <> '{}'::jsonb OR h.satiety > 1000);

-- ───────────── e) проверка ─────────────
-- Все 56: common, уровень ≤ 10, без очков, сытость ≤ 1000 (ожидается 56 / 0 / 0 / 0 / 0).
SELECT count(*) AS heroes,
       count(*) FILTER (WHERE h.rarity <> 'common') AS not_common,
       count(*) FILTER (WHERE h.level > 10) AS above_10,
       count(*) FILTER (WHERE h.skills <> '{}'::jsonb) AS with_skills,
       count(*) FILTER (WHERE h.satiety > 1000) AS satiety_over
  FROM yuplink.hero_instance h
 WHERE h.id IN (SELECT id FROM yuplink.hero_instance_bak_20261022);

-- Возврат: ключей, аккаунтов, лайков (первый прогон 22.10: 10 / 10 / 31 400).
SELECT count(*) AS refunds, count(DISTINCT g.account_id) AS accounts, sum(g.delta) AS likes
  FROM yuplink.like_grant_log g
 WHERE g.ref LIKE 'hero_rarity_refund:%';

-- Возврат ложится ровно на героев, у которых был уровень выше 10 (ожидается 0 расхождений),
-- и likes_spent теперь = журнал − возврат (ожидается 0).
SELECT count(*) FILTER (WHERE (r.refund > 0) <> (b.level > 10)) AS refund_vs_level_mismatch,
       count(*) FILTER (WHERE h.likes_spent <> r.logged - r.refund) AS likes_spent_mismatch
  FROM hero_refund_20261022 r
  JOIN yuplink.hero_instance_bak_20261022 b ON b.id = r.id
  JOIN yuplink.hero_instance h ON h.id = r.id;

-- Балансы: прибавка против копии (на первом прогоне = 31 400 и по аккаунту = возврату).
SELECT u.account_id, x.available AS before, u.available AS after,
       u.available - x.available AS added,
       (SELECT sum(r.refund) FROM hero_refund_20261022 r WHERE r.account_id = u.account_id) AS refund
  FROM yuplink.user_like_balance u
  JOIN yuplink.user_like_balance_bak_20261022_refund x ON x.account_id = u.account_id
 ORDER BY added DESC;

COMMIT;
