-- Лайки за боссов острова (§8.47, 17.10.2026): перед выдачей считаем, сколько
-- аккаунт уже набрал с боссов всех своих островов (island-likes.ts). Без
-- индекса это скан всей очереди наград (~400 тыс. строк, ~30 мс) на каждого
-- поверженного босса острова. Частичный — только лайки островов: крошечный.
-- Условие должно совпадать с запросом в islandLikesEarned дословно.
CREATE INDEX CONCURRENTLY IF NOT EXISTS raid_reward_isle_likes
  ON yuplink.raid_reward (account_id)
  WHERE reward_kind = 'likes' AND left(location_id, 5) = 'isle_';
