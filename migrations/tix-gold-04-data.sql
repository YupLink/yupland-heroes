-- Билеты → золото: ДАННЫЕ (владелец, 20.10.2026, ПРАВИЛА §8.61).
--
-- ПРИМЕНЯТЬ ПОСЛЕ выката кода (код уже не начисляет и не тратит билеты).
-- Одна транзакция; повторный запуск ничего не задваивает: копии — IF NOT EXISTS
-- (остаётся снимок ПЕРВОГО запуска), правки JSON ищут только то, где ещё есть
-- билеты, движения счетов идут с уникальными ключами (вид + ref).
--
-- Что делает:
--   a) копии затронутых строк/таблиц  *_bak_20261020_tix;
--   b) НАГРАДЫ билетами → золото ×100 в родном формате места:
--      мистик-боксы (chip_packs.mystic_pool), неполученные подарки (player_gift),
--      незабранные награды карты (raid_reward);
--   c) ЦЕНЫ билетами → золото ×500 (вверх до целого) в родном формате места:
--      проходы (клетка building_config.portal.prices, raid_portal_room.tpl.prices,
--      settings.portal_group_names), колонна заклинаний (spellbook.learnPrices /
--      forgetPrices), тиры построек (mystic_item_template.meta.tiers: price → costs);
--   d) остатки билетов → золото ×100 (источник истины — ticket_balance.balance:
--      шахты писали баланс мимо журнала);
--   e) маркет фишек: активные лоты → cancelled, фишки listed → owned
--      (как отмена лота в chipsMarket.ts);
--   f) проверочные SELECT после COMMIT.
-- НЕ трогает (у формата нет золота или цену в билетах пересчитывает код ×500/×100):
--   chip_boss.reward_tiers (наполнители tickets — старый недельный босс, вида
--   resource у него нет), chambersPrices / levelPrices клеток и raid_world.spec
--   (kind tickets|likes|token|energy), energy_packs.price_tickets/price_steps,
--   chip_packs.price_tickets, campaigns.ticket_cost, like_shop_offers.tickets,
--   ticket_events.reward_tickets, settings 'hallway:config'.release, ticket_shop_offers;
--   история (журналы, покупки, chip_pack_grants.result_chips) — как была.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- Пока идёт перевод, никто не двигает билеты и лоты (короткая транзакция).
LOCK TABLE yuplink.ticket_balance IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE yuplink.chip_market_listings IN SHARE ROW EXCLUSIVE MODE;

-- ───────────── a) копии ─────────────
CREATE TABLE IF NOT EXISTS yuplink.raid_map_cells_bak_20261020_tix AS SELECT * FROM yuplink.raid_map_cells WHERE building_config::text ILIKE '%ticket%';
CREATE TABLE IF NOT EXISTS yuplink.raid_portal_room_bak_20261020_tix AS SELECT * FROM yuplink.raid_portal_room;
CREATE TABLE IF NOT EXISTS yuplink.settings_bak_20261020_tix AS SELECT * FROM yuplink.settings WHERE key = 'portal_group_names';
CREATE TABLE IF NOT EXISTS yuplink.mystic_item_template_bak_20261020_tix AS SELECT * FROM yuplink.mystic_item_template;
CREATE TABLE IF NOT EXISTS yuplink.chip_packs_bak_20261020_tix AS SELECT * FROM yuplink.chip_packs;
CREATE TABLE IF NOT EXISTS yuplink.player_gift_bak_20261020_tix AS SELECT * FROM yuplink.player_gift WHERE kind = 'tickets';
CREATE TABLE IF NOT EXISTS yuplink.raid_reward_bak_20261020_tix AS SELECT * FROM yuplink.raid_reward WHERE reward_kind = 'tickets';
CREATE TABLE IF NOT EXISTS yuplink.ticket_balance_bak_20261020_tix AS SELECT * FROM yuplink.ticket_balance;
CREATE TABLE IF NOT EXISTS yuplink.account_balances_bak_20261020_tix AS SELECT account_id, tickets, updated_at FROM yuplink.account_balances WHERE tickets <> 0;
CREATE TABLE IF NOT EXISTS yuplink.account_resources_bak_20261020_tix AS SELECT * FROM yuplink.account_resources WHERE resource = 'gold';
CREATE TABLE IF NOT EXISTS yuplink.chip_market_listings_bak_20261020_tix AS SELECT * FROM yuplink.chip_market_listings WHERE status = 'active';
CREATE TABLE IF NOT EXISTS yuplink.user_chip_inventory_bak_20261020_tix AS SELECT * FROM yuplink.user_chip_inventory WHERE status = 'listed';

-- ───────────── помощники (живут до конца сессии) ─────────────
-- Список цен {resource, amount, token, itemKey?, itemName?}: строка с билетами
-- становится золотом ×500 вверх до целого (как goldForTicketPrice), прочие — как были.
CREATE OR REPLACE FUNCTION pg_temp.tix_prices(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(p) IS DISTINCT FROM 'array' THEN p ELSE COALESCE((
    SELECT jsonb_agg(
             CASE WHEN e->>'resource' = 'tickets'
                  THEN e || jsonb_build_object(
                         'resource', 'gold', 'token', NULL,
                         'amount', ceil((e->>'amount')::numeric * 500 - 0.000000001))
                  ELSE e END
             ORDER BY o)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS x(e, o)), '[]'::jsonb) END
$f$;

-- Пул мистик-бокса: приз «билеты» → «ресурс золото» ×100, подпись «Билеты…» убрана
-- (игрок увидит обычное «Золото»). Формат как у живых строк: kind resource + resource gold.
CREATE OR REPLACE FUNCTION pg_temp.tix_pool(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(p) IS DISTINCT FROM 'array' THEN p ELSE COALESCE((
    SELECT jsonb_agg(
             CASE WHEN e->>'kind' = 'tickets'
                  THEN (e - 'label' - 'amountMin' - 'amountMax' - 'amount')
                       || jsonb_build_object('kind', 'resource', 'resource', 'gold')
                       || CASE WHEN e ? 'amountMin'
                               THEN jsonb_build_object('amountMin', (e->>'amountMin')::numeric * 100)
                               ELSE '{}'::jsonb END
                       || CASE WHEN e ? 'amountMax'
                               THEN jsonb_build_object('amountMax', (e->>'amountMax')::numeric * 100)
                               ELSE '{}'::jsonb END
                       || CASE WHEN e ? 'amount'
                               THEN jsonb_build_object('amount', (e->>'amount')::numeric * 100)
                               ELSE '{}'::jsonb END
                  ELSE e END
             ORDER BY o)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS x(e, o)), '[]'::jsonb) END
$f$;

-- ───────────── c) ЦЕНЫ → золото ×500 ─────────────
-- Проход на клетке.
UPDATE yuplink.raid_map_cells
   SET building_config = jsonb_set(building_config, '{portal,prices}',
                                   pg_temp.tix_prices(building_config #> '{portal,prices}'))
 WHERE building_config #> '{portal,prices}' @> '[{"resource":"tickets"}]';

-- Колонна заклинаний на клетке: выучить / забыть.
UPDATE yuplink.raid_map_cells
   SET building_config = jsonb_set(building_config, '{spellbook,learnPrices}',
                                   pg_temp.tix_prices(building_config #> '{spellbook,learnPrices}'))
 WHERE building_config #> '{spellbook,learnPrices}' @> '[{"resource":"tickets"}]';
UPDATE yuplink.raid_map_cells
   SET building_config = jsonb_set(building_config, '{spellbook,forgetPrices}',
                                   pg_temp.tix_prices(building_config #> '{spellbook,forgetPrices}'))
 WHERE building_config #> '{spellbook,forgetPrices}' @> '[{"resource":"tickets"}]';

-- Комнаты-порталы «этаж.номер».
UPDATE yuplink.raid_portal_room
   SET tpl = jsonb_set(tpl, '{prices}', pg_temp.tix_prices(tpl->'prices')),
       updated_at = now()
 WHERE tpl->'prices' @> '[{"resource":"tickets"}]';

-- Группы проходов (settings.value — текст с JSON).
UPDATE yuplink.settings s
   SET value = (
     SELECT jsonb_object_agg(g.key,
              CASE WHEN g.value->'prices' @> '[{"resource":"tickets"}]'
                   THEN jsonb_set(g.value, '{prices}', pg_temp.tix_prices(g.value->'prices'))
                   ELSE g.value END)
       FROM jsonb_each(s.value::jsonb) AS g)::text
 WHERE s.key = 'portal_group_names'
   AND EXISTS (SELECT 1 FROM jsonb_each(s.value::jsonb) AS g
                WHERE g.value->'prices' @> '[{"resource":"tickets"}]');

-- Тиры построек: одиночная цена {kind:tickets} → список costs с золотом
-- (как сохраняет нынешняя админка: price null, costs [...]). Если costs уже
-- задан — платят им; билеты в нём тоже переводятся.
UPDATE yuplink.mystic_item_template t
   SET meta = jsonb_set(t.meta, '{tiers}', (
     SELECT jsonb_agg(
              CASE
                WHEN tier->'price'->>'kind' = 'tickets'
                  OR tier->'costs' @> '[{"resource":"tickets"}]'
                THEN tier || jsonb_build_object(
                  'price',
                    CASE WHEN tier->'price'->>'kind' = 'tickets' THEN NULL ELSE tier->'price' END,
                  'costs',
                    CASE
                      WHEN jsonb_typeof(tier->'costs') = 'array' AND tier->'costs' <> '[]'::jsonb
                        THEN pg_temp.tix_prices(tier->'costs')
                      ELSE jsonb_build_array(jsonb_build_object(
                             'token', NULL,
                             'amount', ceil((tier->'price'->>'amount')::numeric * 500 - 0.000000001),
                             'itemKey', NULL, 'itemName', NULL, 'resource', 'gold'))
                    END)
                ELSE tier END
              ORDER BY o)
       FROM jsonb_array_elements(t.meta->'tiers') WITH ORDINALITY AS x(tier, o)))
 WHERE t.kind = 'building'
   AND jsonb_typeof(t.meta->'tiers') = 'array'
   AND (t.meta->'tiers' @> '[{"price":{"kind":"tickets"}}]'
        OR t.meta->'tiers' @> '[{"costs":[{"resource":"tickets"}]}]');

-- ───────────── b) НАГРАДЫ → золото ×100 ─────────────
-- Мистик-боксы (неоткрытые боксы бросают приз из пула при открытии — получат золото).
UPDATE yuplink.chip_packs SET mystic_pool = pg_temp.tix_pool(mystic_pool)
 WHERE jsonb_typeof(mystic_pool) = 'array' AND mystic_pool @> '[{"kind":"tickets"}]';

-- Неполученные подарки (формат золота: kind resource, ref_id gold). На 20.10 таких 0.
UPDATE yuplink.player_gift
   SET kind = 'resource', ref_id = 'gold', amount = amount * 100
 WHERE kind = 'tickets' AND status = 'pending';

-- Незабранные награды карты (формат золота: reward_kind resource, pack_id gold). На 20.10 таких 0.
UPDATE yuplink.raid_reward
   SET reward_kind = 'resource', pack_id = 'gold', reward_amount = reward_amount * 100
 WHERE reward_kind = 'tickets' AND claimed_at IS NULL;

-- ───────────── d) остатки билетов → золото ×100 ─────────────
-- Сначала забираем билеты (ticket_move), потом даём золото (res_move) — тем же
-- ключом tix2gold:<аккаунт>. Аккаунт, у которого перевод уже был, пропускается.
DO $do$
DECLARE
  r record; v_tix boolean; v_gold boolean;
  v_n int := 0; v_sum numeric := 0; v_skip int := 0;
BEGIN
  FOR r IN SELECT account, balance FROM yuplink.ticket_balance
            WHERE balance > 0 ORDER BY account LOOP
    SELECT m.applied INTO v_tix
      FROM yuplink.ticket_move(r.account, -r.balance, 'gold_convert',
                               'tix2gold:' || r.account, NULL::text) AS m;
    IF NOT v_tix THEN v_skip := v_skip + 1; CONTINUE; END IF;
    SELECT m.applied INTO v_gold
      FROM yuplink.res_move(r.account, 'gold', round(r.balance * 100, 4),
                            'tickets_convert', 'tix2gold:' || r.account) AS m;
    IF NOT v_gold THEN
      RAISE EXCEPTION 'tix2gold: билеты % сняты, а золото уже было начислено раньше — стоп', r.account;
    END IF;
    v_n := v_n + 1;
    v_sum := v_sum + round(r.balance * 100, 4);
  END LOOP;
  RAISE NOTICE 'tix2gold: переведено аккаунтов %, золота %, пропущено (перевод уже был) %', v_n, v_sum, v_skip;
END $do$;

-- ───────────── e) маркет фишек снят ─────────────
-- Как отмена лота в коде: сперва гасим лот, потом отпускаем фишку.
UPDATE yuplink.chip_market_listings SET status = 'cancelled' WHERE status = 'active';
UPDATE yuplink.user_chip_inventory SET status = 'owned', updated_at = now() WHERE status = 'listed';

COMMIT;

-- ───────────── f) проверка (только чтение) ─────────────
SELECT 1 AS n, 'билеты на балансах' AS what, count(*) AS rows, COALESCE(sum(balance), 0) AS total
  FROM yuplink.ticket_balance WHERE balance > 0
UNION ALL
SELECT 2, 'золото выдано за билеты', count(*), COALESCE(sum(delta), 0)
  FROM yuplink.res_ledger WHERE kind = 'tickets_convert'
UNION ALL
SELECT 3, 'активные лоты маркета', count(*), NULL FROM yuplink.chip_market_listings WHERE status = 'active'
UNION ALL
SELECT 4, 'фишки listed', count(*), NULL FROM yuplink.user_chip_inventory WHERE status = 'listed'
UNION ALL
SELECT 5, 'клетки: цена прохода/заклинаний в билетах (должно 0)', count(*), NULL
  FROM yuplink.raid_map_cells WHERE building_config #> '{portal,prices}' @> '[{"resource":"tickets"}]'
    OR building_config #> '{spellbook,learnPrices}' @> '[{"resource":"tickets"}]'
    OR building_config #> '{spellbook,forgetPrices}' @> '[{"resource":"tickets"}]'
UNION ALL
SELECT 6, 'комнаты-порталы с ценой в билетах (должно 0)', count(*), NULL
  FROM yuplink.raid_portal_room WHERE tpl->'prices' @> '[{"resource":"tickets"}]'
UNION ALL
SELECT 7, 'группы проходов с ценой в билетах (должно 0)', count(*), NULL
  FROM yuplink.settings s, jsonb_each(s.value::jsonb) g
 WHERE s.key = 'portal_group_names' AND g.value->'prices' @> '[{"resource":"tickets"}]'
UNION ALL
SELECT 8, 'тиры построек с ценой в билетах (должно 0)', count(*), NULL
  FROM yuplink.mystic_item_template WHERE kind = 'building'
   AND (meta->'tiers' @> '[{"price":{"kind":"tickets"}}]' OR meta->'tiers' @> '[{"costs":[{"resource":"tickets"}]}]')
UNION ALL
SELECT 9, 'мистик-пулы с билетами (должно 0)', count(*), NULL
  FROM yuplink.chip_packs WHERE mystic_pool @> '[{"kind":"tickets"}]'
UNION ALL
SELECT 10, 'подарки-билеты ждут (должно 0)', count(*), NULL
  FROM yuplink.player_gift WHERE kind = 'tickets' AND status = 'pending'
UNION ALL
SELECT 11, 'награды-билеты не забраны (должно 0)', count(*), NULL
  FROM yuplink.raid_reward WHERE reward_kind = 'tickets' AND claimed_at IS NULL
UNION ALL
SELECT 12, 'ОСТАЛОСЬ для кода: chambers/levelPrices клеток в билетах', count(*), NULL
  FROM yuplink.raid_map_cells WHERE building_config->'chambersPrices' @> '[{"kind":"tickets"}]'
    OR building_config->'levelPrices' @> '[{"kind":"tickets"}]'
UNION ALL
SELECT 13, 'ОСТАЛОСЬ для кода: наполнители tickets у chip_boss', count(*), NULL
  FROM yuplink.chip_boss WHERE reward_tiers->'fillers' @> '[{"kind":"tickets"}]'
UNION ALL
SELECT 14, 'ОСТАЛОСЬ для кода: энергопаки со ступенями в билетах', count(*), NULL
  FROM yuplink.energy_packs WHERE price_steps @> '[{"kind":"tickets"}]' OR price_tickets > 0
ORDER BY n;
