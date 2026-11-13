-- achv-fix-02: «Хозяин шахт» (§8.57) — пересчёт DARAI с шахт и грибов: 1 очко
-- за каждые 1 000 DARAI. Владелец, 22.10.2026: «по ачивке — сделай пересчёт,
-- каждые 1к дараи = 1 очко».
--
-- Что было в счёте (журнал acc_ledger: kind 'mine', token 'Darai'):
--  • D1 — сборы DARAI кнопкой «Собрать» с выката ачивок (код 16.10, после
--    22:15 UTC) до выката 5d6f0bb9 (22.10, 18:17:35 UTC): шли в счёт 1 к 1.
--  • D2 — такие же сборы после 5d6f0bb9: шли в счёт нулём.
--  • Отдача прежнему хозяину при захвате и подъёме гриба (ref …:capN) в счёт не
--    шла никогда — как у всех шахт; так и остаётся, её не трогаем.
--  Все суммы DARAI с шахт кратны 10 000 — делить на 1 000 без остатка.
--
-- Новый счёт = max(0, счёт − D1) + floor(D1 / 1000) + floor(D2 / 1000).
-- Понижение — тоже (владелец: «сделай пересчёт»).
--
-- Редкость, торговля, ячейки рюкзака, прибавки героев и портал острова нигде не
-- хранятся — их считают из счёта при каждом чтении (hero-load →
-- achievementBonus, market-backpack). Ячеек стало меньше — вещи остаются,
-- новые не принимаются (assertBackpackRoomFor: потолок — max(ёмкость, занято)).
--
-- Копия до правки: yuplink.achv02_minelord_bak_20261022 (счёт до, D1, D2, после).
-- Повтор безвреден: копия уже есть — файл ничего не меняет, только снова
-- показывает таблицу «было → стало».
--
-- ПОРЯДОК: ДО выката кода «1 очко за 1 000». D2 берётся по эту минуту; после
-- выката код сам кладёт DARAI в счёт, и повторно учитывать его нельзя. DARAI,
-- собранный между этой миграцией и выкатом, пойдёт в счёт нулём (как сейчас).
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.achv02_minelord_bak_20261022 (
  account_id   text PRIMARY KEY,
  count_before bigint NOT NULL,
  darai_1to1   numeric NOT NULL,
  darai_zero   numeric NOT NULL,
  count_after  bigint NOT NULL,
  done_at      timestamptz NOT NULL DEFAULT now()
);

-- План — только если пересчёта ещё не было (копия пуста).
CREATE TEMP TABLE achv02_plan ON COMMIT DROP AS
SELECT l.account_id,
       COALESCE(sum(l.delta) FILTER (WHERE l.created_at <  '2026-10-22 18:17:35+00'), 0) AS d1,
       COALESCE(sum(l.delta) FILTER (WHERE l.created_at >= '2026-10-22 18:17:35+00'), 0) AS d2
  FROM yuplink.acc_ledger l
 WHERE l.kind = 'mine'
   AND l.token = 'Darai'
   AND l.ref !~ ':cap[0-9.]*$'
   AND l.created_at >= '2026-10-16 22:15:00+00'
   AND NOT EXISTS (SELECT 1 FROM yuplink.achv02_minelord_bak_20261022)
 GROUP BY l.account_id;

-- Счётчики под замок: сбор в эту секунду дождётся и ляжет поверх нового счёта.
WITH locked AS (
  SELECT a.account_id FROM yuplink.account_achievement a
   WHERE a.track = 'minelord' AND a.account_id IN (SELECT account_id FROM achv02_plan)
   FOR UPDATE
)
SELECT count(*) AS locked FROM locked;

INSERT INTO yuplink.achv02_minelord_bak_20261022
  (account_id, count_before, darai_1to1, darai_zero, count_after)
SELECT p.account_id,
       COALESCE(a.count, 0),
       p.d1,
       p.d2,
       GREATEST(0, COALESCE(a.count, 0) - floor(p.d1)::bigint)
         + floor(p.d1 / 1000)::bigint + floor(p.d2 / 1000)::bigint
  FROM achv02_plan p
  LEFT JOIN yuplink.account_achievement a
         ON a.account_id = p.account_id AND a.track = 'minelord'
ON CONFLICT (account_id) DO NOTHING;

-- Разница — поверх текущего счёта (строки под замком: итог = count_after).
-- Строки не было (DARAI только после 5d6f0bb9) — вставка с новым счётом.
INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
SELECT b.account_id, 'minelord', b.count_after - b.count_before, now()
  FROM yuplink.achv02_minelord_bak_20261022 b
  JOIN achv02_plan p USING (account_id)
ON CONFLICT (account_id, track)
DO UPDATE SET count = yuplink.account_achievement.count + EXCLUDED.count, updated_at = now();

-- Было → стало: счёт, редкость, торговля (+1/+3/+6/+9/+12/+24; ячейка рюкзака за 10).
SELECT b.account_id,
       ac.active_wallet AS wallet,
       b.count_before   AS count_was,
       b.count_after    AS count_now,
       (ARRAY['—','обычная','необычная','редкая','эпическая','легендарная','мифическая'])[s.was + 1] AS rarity_was,
       (ARRAY['—','обычная','необычная','редкая','эпическая','легендарная','мифическая'])[s.now + 1] AS rarity_now,
       (ARRAY[0,1,3,6,9,12,24])[s.was + 1] AS trade_was,
       (ARRAY[0,1,3,6,9,12,24])[s.now + 1] AS trade_now,
       cur.count        AS count_in_table
  FROM yuplink.achv02_minelord_bak_20261022 b
  LEFT JOIN yuplink.accounts ac ON ac.id = b.account_id
  LEFT JOIN yuplink.account_achievement cur
         ON cur.account_id = b.account_id AND cur.track = 'minelord'
 CROSS JOIN LATERAL (
   SELECT (SELECT count(*) FROM unnest(ARRAY[100,1000,2500,6000,14000,30000]) t
            WHERE b.count_before >= t)::int AS was,
          (SELECT count(*) FROM unnest(ARRAY[100,1000,2500,6000,14000,30000]) t
            WHERE b.count_after >= t)::int AS now
 ) s
 ORDER BY b.count_before DESC;

COMMIT;
