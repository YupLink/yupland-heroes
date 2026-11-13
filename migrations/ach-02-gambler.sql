-- Ачивка «Удачливый лудоман» (владелец, 21.10.2026): оборот в казино. Прошлый
-- оборот — из статистики автомата (slot_session.state.stats.wagered: сервер ведёт
-- её на каждом спине, сброс с браузера закрыт 14.10). Можно катить до и после кода:
-- берётся больший из двух счётов. Идемпотентно.
INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
SELECT s.account_id, 'gambler', floor((s.state->'stats'->>'wagered')::numeric)::bigint, now()
  FROM yuplink.slot_session s
 WHERE s.account_id NOT LIKE 'zz_%'
   AND COALESCE((s.state->'stats'->>'wagered')::numeric, 0) >= 1
ON CONFLICT (account_id, track)
DO UPDATE SET count = GREATEST(yuplink.account_achievement.count, EXCLUDED.count), updated_at = now();
