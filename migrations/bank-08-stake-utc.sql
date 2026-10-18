-- Золото стейкинга — раз в сутки для всех, в 00:00 UTC (владелец, 16.10.2026, §8.51).
-- Вклад начинает работать со следующих суток после вклада (по UTC); золото за сутки
-- приходит в 00:00 UTC по их окончании. Вложил 16.10 в 14:00 — работает с 17.10,
-- первое золото 18.10 в 00:00 UTC. Неполные сутки не оплачиваются: иначе вклад
-- в 23:59 получал бы целые сутки золота за минуту.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.bank_stake_accrue(p_stake text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE s record; v_today date := (now() AT TIME ZONE 'UTC')::date; v_due integer; v_gold numeric; n integer := 0;
BEGIN
  FOR s IN SELECT * FROM yuplink.bank_stake
            WHERE status = 'active' AND (p_stake IS NULL OR id = p_stake)
              AND (created_at AT TIME ZONE 'UTC')::date + 1 < v_today
            ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    -- полных суток с начала работы (следующий день после вклада) до сегодняшних 00:00 UTC
    v_due := (v_today - ((s.created_at AT TIME ZONE 'UTC')::date + 1)) - s.days_paid;
    IF v_due <= 0 THEN CONTINUE; END IF;
    v_gold := round(s.gold_day * v_due, 4);
    IF v_gold > 0 THEN
      PERFORM * FROM yuplink.res_move(s.account_id, 'gold', v_gold, 'bank_stake',
                                      'bstk:' || s.id || ':d' || (s.days_paid + v_due));
    END IF;
    UPDATE yuplink.bank_stake SET days_paid = days_paid + v_due, gold_paid = gold_paid + v_gold WHERE id = s.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

COMMIT;
