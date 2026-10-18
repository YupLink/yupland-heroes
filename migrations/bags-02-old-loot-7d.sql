-- Старые предметы в «Добыче» — срок 7 дней (владелец, 29.09.2026; ПРАВИЛА §8.21).
--
-- С мешочками предметы с карты ложатся сразу в рюкзак, а что не влезло — на
-- клетку. Предметы, что уже ждут в «Добыче» бессрочно (свой товар 'custom' и
-- предмет-артефакт 'item'), получают срок: 7 дней с наката, потом сгорают —
-- сгоревшую награду не показывает и не выдаёт ни один путь
-- (raid-reward-live.ts::liveRewardSql). Валюты, ресурсы, лайки, энергия и паки
-- не трогаем. Магический сундук, отнятый захватом (§8.15, строка `custom` без
-- срока), — тоже не трогаем: он бессрочный по своему правилу.
--
-- Проверка ДО наката — сколько строк получит срок:
--   SELECT r.reward_kind, count(*) AS rows, count(DISTINCT r.account_id) AS accounts
--     FROM yuplink.raid_reward r
--    WHERE r.claimed_at IS NULL AND r.expires_at IS NULL
--      AND r.reward_kind IN ('custom', 'item')
--      AND NOT EXISTS (SELECT 1 FROM yuplink.raid_custom_item ci
--                       WHERE ci.id = r.pack_id AND ci.magic_chest)
--    GROUP BY r.reward_kind;
-- На 29.09.2026 (вечер): custom — 7420 строк (125 аккаунтов), item — 72 (15);
-- сундуков, ждущих в «Добыче», — 0.
--
-- Накатывать ПОСЛЕ выката кода мешочков. Повтор задевает только строки без
-- срока: после выката это лишь редкие предметы, ушедшие в «Добычу» мимо
-- мешочка (его «забор» не пустил или товара нет в справочнике), — им тоже 7 дней.
SET lock_timeout = '5s';

UPDATE yuplink.raid_reward r
   SET expires_at = now() + interval '7 days'
 WHERE r.claimed_at IS NULL
   AND r.expires_at IS NULL
   AND r.reward_kind IN ('custom', 'item')
   AND NOT EXISTS (SELECT 1 FROM yuplink.raid_custom_item ci
                    WHERE ci.id = r.pack_id AND ci.magic_chest);
