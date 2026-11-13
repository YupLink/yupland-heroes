-- Грибы: обход «конец жизни в рюкзаке» сверяет героя под локом (22.10.2026).
-- Гонка: raid_mushroom_expire_item читал hero_id гриба ДО лока рюкзака и после лока
-- не сверял. Рынок героев (hero-market-03) переносит грибы выставляемого героя
-- основному под теми же локами bp: — если гриб умирал ровно в этот момент, обход гасил
-- строку гриба, а минус штуку делал в рюкзаке прежнего героя (стопки там уже нет), и у
-- основного оставалась штука в стопке без строки под ней. Теперь гасим, только если
-- герой гриба тот же; иначе — false, следующий обход (минута) погасит у нового героя.
-- Только CREATE OR REPLACE; повторный накат безопасен. Тело — как в mushroom-03 (там тоже правка).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Конец жизни в рюкзаке — минус штука из стопки своего вида.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_item(p_id text)
RETURNS boolean
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_hero  text;
  v_stack text;
BEGIN
  SELECT d.hero_id, 'dmine:' || d.mushroom INTO v_hero, v_stack FROM yuplink.raid_dmine d
   WHERE d.id = p_id AND d.state = 'item' AND d.dies_at <= now();
  IF NOT FOUND THEN RETURN false; END IF;
  -- Лок рюкзака — до строки гриба, в порядке «Посадить» (рюкзак, потом гриб).
  IF v_hero IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bp:' || v_hero));
  END IF;
  -- Под локом — тот же герой: гриб мог уехать к основному (рынок героев, hero-market-03),
  -- пока ждали; тогда не трогаем — следующий обход погасит его у нового героя (mushroom-05).
  UPDATE yuplink.raid_dmine SET state = 'gone'
   WHERE id = p_id AND state = 'item' AND dies_at <= now()
     AND hero_id IS NOT DISTINCT FROM v_hero;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_hero IS NOT NULL THEN
    UPDATE yuplink.raid_hero_backpack SET count = count - 1, updated_at = now()
     WHERE hero_id = v_hero AND stack_key = v_stack AND count > 1;
    IF NOT FOUND THEN
      DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = v_hero AND stack_key = v_stack;
    END IF;
  END IF;
  RETURN true;
END $fn$;

SELECT to_regprocedure('yuplink.raid_mushroom_expire_item(text)') AS expire_fn;
COMMIT;
