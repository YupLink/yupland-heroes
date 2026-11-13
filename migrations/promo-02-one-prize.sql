-- Промокоды: ОДИН приз по весам (владелец, 05.11.2026): «это что-то одно из
-- шансов — шансы в весах должны быть; тут только один приз может быть, и
-- «ничего» тоже может быть в призах — отдельный выбор». До этого каждая строка
-- бросалась своим шансом: 50 + 50 давало и оба приза, и ни одного.
--
--  • Новый вид строки 'nothing' — «Ничего»: свой вес, без ссылки и объёма; при
--    выпадении ничего не выдаётся, у строки растёт счётчик given.
--  • promo_redeem: шанс строки = её вес среди строк, где ещё есть объём; выпадает
--    ровно одна. Остальное как было: лок кода, предел игроков, «код кончился,
--    когда выбраны все строки с объёмом», повтор ввода — прежний ответ.
--
-- Действует и на уже заведённые коды (8SB2-KXQ6: динамит 50 / лесопилка 50 —
-- теперь всегда одно из двух). Порядок: до кода. Повтор безвреден.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.promo_code_line DROP CONSTRAINT IF EXISTS promo_code_line_kind_check;
ALTER TABLE yuplink.promo_code_line ADD CONSTRAINT promo_code_line_kind_check
  CHECK (kind IN ('token', 'resource', 'likes', 'energy', 'custom', 'pack', 'art', 'hero', 'boss',
                  'nothing'));

CREATE OR REPLACE FUNCTION yuplink.promo_redeem(p_code text, p_account text, p_wallet text, p_op text, p_tg bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  c      yuplink.promo_code;
  prev   yuplink.promo_redemption;
  l      yuplink.promo_code_line;
  v_amt  bigint;
  v_rid  text;
  v_out  jsonb := '[]'::jsonb;
  v_line yuplink.promo_code_line;
  v_found boolean := false;
  v_total numeric;
  v_pick numeric;
BEGIN
  -- Лок на код: вводы одного кода встают в очередь, и ни предел игроков, ни
  -- объём строк параллельными нажатиями не пробиваются.
  SELECT * INTO c FROM yuplink.promo_code WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Уже вводил — та же активация. Выключенный после ввода код повтору не
  -- мешает: выпавшее уже зарезервировано и обязано доехать.
  SELECT * INTO prev FROM yuplink.promo_redemption
   WHERE code_id = c.id AND account_id = p_account;
  IF FOUND THEN
    RETURN jsonb_build_object('id', prev.id, 'code', c.code, 'status', prev.status,
                              'same_op', prev.op = p_op, 'was', true,
                              'rolled', prev.rolled, 'delivered', prev.delivered);
  END IF;

  -- Тот же Telegram уже вводил код с другого аккаунта — «уже активирован».
  IF p_tg IS NOT NULL AND EXISTS (SELECT 1 FROM yuplink.promo_redemption r
                                   WHERE r.code_id = c.id AND r.telegram_id = p_tg) THEN
    RETURN jsonb_build_object('error', 'used');
  END IF;

  IF NOT c.active THEN
    RETURN jsonb_build_object('error', 'inactive');
  END IF;
  IF c.max_users IS NOT NULL AND c.used_users >= c.max_users THEN
    RETURN jsonb_build_object('error', 'exhausted');
  END IF;
  -- Объём: все строки с пределом выбраны — код кончился, даже если рядом есть
  -- строки без предела (они идут «в нагрузку» к ограниченному призу).
  IF EXISTS (SELECT 1 FROM yuplink.promo_code_line x
              WHERE x.code_id = c.id AND x.budget IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM yuplink.promo_code_line x
                      WHERE x.code_id = c.id AND x.budget IS NOT NULL AND x.given < x.budget) THEN
    RETURN jsonb_build_object('error', 'exhausted');
  END IF;

  v_rid := 'prd_' || substr(md5(c.id || ':' || p_account), 1, 24);
  -- Один приз по весам (владелец, 05.11.2026): шанс строки — её вес среди
  -- строк, где ещё есть объём; «Ничего» — такая же строка со своим весом.
  SELECT COALESCE(sum(x.chance), 0) INTO v_total FROM yuplink.promo_code_line x
   WHERE x.code_id = c.id AND (x.budget IS NULL OR x.given < x.budget);
  IF v_total > 0 THEN
    v_pick := random() * v_total;
    FOR l IN SELECT * FROM yuplink.promo_code_line x
              WHERE x.code_id = c.id AND (x.budget IS NULL OR x.given < x.budget)
              ORDER BY x.idx LOOP
      v_line := l;
      v_found := true;
      v_pick := v_pick - l.chance;
      -- Не нашлось из-за округления — остаётся последняя строка.
      EXIT WHEN v_pick < 0;
    END LOOP;
  END IF;
  IF v_found AND v_line.kind = 'nothing' THEN
    -- Счётчик «сколько раз выпало ничего» — для админа.
    UPDATE yuplink.promo_code_line SET given = given + 1
     WHERE code_id = c.id AND idx = v_line.idx;
  ELSIF v_found THEN
    -- Диапазон включительно: «1-10» даёт и 1, и 10; остаток объёма режет бросок.
    v_amt := v_line.amount_min + floor(random() * (v_line.amount_max - v_line.amount_min + 1))::bigint;
    IF v_line.budget IS NOT NULL THEN
      v_amt := LEAST(v_amt, v_line.budget - v_line.given);
    END IF;
    IF v_amt > 0 THEN
      UPDATE yuplink.promo_code_line SET given = given + v_amt
       WHERE code_id = c.id AND idx = v_line.idx;
      v_out := jsonb_build_array(jsonb_build_object(
        'idx', v_line.idx, 'kind', v_line.kind, 'ref', v_line.ref_id, 'title', v_line.title,
        'image', v_line.image, 'amount', v_amt));
    END IF;
  END IF;

  -- Ввод засчитан и тогда, когда выпало «Ничего».
  UPDATE yuplink.promo_code SET used_users = used_users + 1 WHERE id = c.id;
  INSERT INTO yuplink.promo_redemption (id, code_id, account_id, wallet, telegram_id, op, rolled)
  VALUES (v_rid, c.id, p_account, p_wallet, p_tg, p_op, v_out);
  RETURN jsonb_build_object('id', v_rid, 'code', c.code, 'status', 'reserved',
                            'same_op', true, 'was', false,
                            'rolled', v_out, 'delivered', '{}'::jsonb);
END $function$;

COMMIT;
