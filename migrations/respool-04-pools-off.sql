-- Пулы ресурсов и кассы ратуш ОТМЕНЕНЫ (владелец, 16.10.2026, вечер: «никаких пулов не
-- нужно — золото из ниоткуда для торговли = норма»). Остаётся ОДИН пул — золото казино
-- («пулы нужны на то, сколько заработало казино — нужен пул по золоту, туда капает всё»):
-- ставка игрока в слоте — в пул, выигрыш — из пула (журнал res_ledger, kind slot_*).
-- Пул может быть в минусе — значит, казино в убытке. Стройка и лавки больше не капают.
-- Пул стартует с итога казино за всё время. Применять ПОСЛЕ выкатки кода без касс.
BEGIN;
LOCK TABLE yuplink.res_ledger IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION yuplink.res_pool_from_ledger() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.resource <> 'gold' OR NEW.kind NOT LIKE 'slot\_%' THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref)
    VALUES ('gold', -NEW.delta, 'casino:' || NEW.kind, 'led:' || NEW.id)
    ON CONFLICT (ref) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'res_pool_from_ledger: %', SQLERRM;
  END;
  RETURN NEW;
END $fn$;

-- Золото пула = итог казино за всё время: недостающее одной записью.
INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref)
SELECT 'gold',
       (SELECT COALESCE(-sum(delta), 0) FROM yuplink.res_ledger
         WHERE resource = 'gold' AND kind LIKE 'slot\_%')
       - (SELECT balance FROM yuplink.res_pool WHERE resource = 'gold'),
       'seed', 'seed:2026-10-16:casino'
ON CONFLICT (ref) DO NOTHING;

DELETE FROM yuplink.settings WHERE key IN ('town_cash_limit', 'res_hold_pass');
COMMIT;
