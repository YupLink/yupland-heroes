-- Наборы: набор новичка и фаундерпаки (задачник владельца, 04.10.2026).
--
-- НАКАТЫВАТЬ ДО ВЫКАТА КОДА: витрина в окне «Купить энергию», админка
-- «Наборы» и покупка читают эти таблицы и зовут эти функции. Без таблиц окно
-- просто не покажет наборов, админка ответит ошибкой. Наборов миграция НЕ
-- заводит — их заводит админ.
--
-- Набор продаётся за USDT или DARAI со счёта игрока (acc_ledger). Покупка:
-- бронь (kit_reserve, ДО денег) → списание (kit_pay: acc_move под замком
-- брони и только пока она «reserved») → выдача подарками одним запросом с
-- отметкой «выдано» (код, kits/kit-grant-sql.ts) → при сбое снятие брони с
-- возвратом денег (kit_release, одной транзакцией).
--
-- Замки всегда в одном порядке: бронь → счёт (kit_pay и kit_release), поэтому
-- запоздавшая после таймаута моста оплата снятую бронь уже не оплатит, а
-- снятие оплаченной брони вернёт деньги — дедлока между ними нет.
--
-- Тираж и лимит на аккаунт считаются под замком строки набора: все покупки
-- одного набора идут по очереди, и каждая следующая видит закоммиченную бронь
-- предыдущей. Повтор того же нажатия (тот же pay_ref) находит свою бронь и
-- второй не заводит.
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.kit (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  name_en     text NOT NULL DEFAULT '',
  image       text,
  -- Строки состава — те же, что у призов турнира: kind, amount, refId, title, image.
  contents    jsonb NOT NULL DEFAULT '[]'::jsonb,
  token       text NOT NULL CHECK (token IN ('USDT', 'Darai')),
  price       numeric(38,8) NOT NULL CHECK (price > 0),
  -- Тираж: сколько всего штук. NULL — без тиража.
  stock       int CHECK (stock IS NULL OR stock >= 1),
  -- Сколько штук может купить один аккаунт. NULL — без лимита.
  per_account int CHECK (per_account IS NULL OR per_account >= 1),
  -- Живые брони и покупки (снятые брони возвращают единицу).
  sold        int NOT NULL DEFAULT 0 CHECK (sold >= 0),
  active      boolean NOT NULL DEFAULT false,
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Бронь и покупка. Название, состав и цена — СНИМОК на момент брони: правка
-- набора потом не меняет того, что игрок уже оплатил. Удалить набор, по
-- которому были покупки, нельзя (внешний ключ без CASCADE).
CREATE TABLE IF NOT EXISTS yuplink.kit_order (
  id          text PRIMARY KEY,
  kit_id      text NOT NULL REFERENCES yuplink.kit(id),
  account_id  text NOT NULL,
  wallet      text NOT NULL,
  name        text NOT NULL,
  name_en     text NOT NULL DEFAULT '',
  contents    jsonb NOT NULL,
  token       text NOT NULL,
  price       numeric(38,8) NOT NULL CHECK (price > 0),
  pay_ref     text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'reserved'
              CHECK (status IN ('reserved', 'granted', 'released')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Лимит на аккаунт: живые покупки игрока по набору.
CREATE INDEX IF NOT EXISTS kit_order_kit_acc
  ON yuplink.kit_order (kit_id, account_id) WHERE status <> 'released';
-- Самопочинка: зависшие брони (процесс упал между деньгами и выдачей).
CREATE INDEX IF NOT EXISTS kit_order_reserved
  ON yuplink.kit_order (created_at) WHERE status = 'reserved';

-- Бронь единицы набора — ДО денег. Отказы: kit_not_found, kit_off,
-- kit_price_changed (валюта другая или цена выросла с показа), kit_sold_out,
-- kit_limit. Повтор с тем же p_ref возвращает прежнюю бронь (r_fresh=false)
-- в любом её статусе.
CREATE OR REPLACE FUNCTION yuplink.kit_reserve(
  p_kit text, p_account text, p_wallet text, p_ref text, p_token text, p_price numeric
) RETURNS TABLE (
  r_id text, r_status text, r_token text, r_price numeric, r_fresh boolean,
  r_name text, r_name_en text, r_contents jsonb
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_kit yuplink.kit%ROWTYPE;
  v_old yuplink.kit_order%ROWTYPE;
  v_mine int;
  v_id text;
BEGIN
  IF coalesce(p_ref, '') = '' OR coalesce(p_account, '') = '' THEN
    RAISE EXCEPTION 'kit_bad_call';
  END IF;

  -- Замок набора: покупки одного набора идут по очереди. Каждый запрос ниже
  -- берёт свежий снимок и видит брони, закоммиченные до получения замка.
  SELECT * INTO v_kit FROM yuplink.kit WHERE id = p_kit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit_not_found'; END IF;

  SELECT * INTO v_old FROM yuplink.kit_order WHERE pay_ref = p_ref;
  IF FOUND THEN
    RETURN QUERY SELECT v_old.id, v_old.status, v_old.token, v_old.price, false,
                        v_old.name, v_old.name_en, v_old.contents;
    RETURN;
  END IF;

  IF NOT v_kit.active THEN RAISE EXCEPTION 'kit_off'; END IF;
  IF v_kit.token <> p_token OR v_kit.price > p_price THEN
    RAISE EXCEPTION 'kit_price_changed';
  END IF;
  IF v_kit.stock IS NOT NULL AND v_kit.sold >= v_kit.stock THEN
    RAISE EXCEPTION 'kit_sold_out';
  END IF;
  IF v_kit.per_account IS NOT NULL THEN
    SELECT count(*) INTO v_mine FROM yuplink.kit_order
     WHERE kit_id = p_kit AND account_id = p_account AND status <> 'released';
    IF v_mine >= v_kit.per_account THEN RAISE EXCEPTION 'kit_limit'; END IF;
  END IF;

  v_id := 'ko_' || substr(md5(p_ref), 1, 16);
  INSERT INTO yuplink.kit_order
    (id, kit_id, account_id, wallet, name, name_en, contents, token, price, pay_ref)
  VALUES
    (v_id, v_kit.id, p_account, p_wallet, v_kit.name, v_kit.name_en, v_kit.contents,
     v_kit.token, v_kit.price, p_ref);
  UPDATE yuplink.kit SET sold = sold + 1, updated_at = now() WHERE id = p_kit;

  RETURN QUERY SELECT v_id, 'reserved'::text, v_kit.token, v_kit.price, true,
                      v_kit.name, v_kit.name_en, v_kit.contents;
END;
$function$;

-- Оплатить бронь: списание по ключу брони, цена — из снимка брони (не
-- аргумент вызова). Только пока бронь «reserved» и под её замком: снятая
-- бронь оплату не примет (kit_released), выданная — ответит «уже оплачено»
-- (r_applied=false). Повтор: acc_move по тому же ключу второй раз не спишет.
-- Не хватает денег — acc_move бросит not_enough_currency:<токен>:<есть>:<нужно>.
CREATE OR REPLACE FUNCTION yuplink.kit_pay(p_order text)
RETURNS TABLE (r_status text, r_applied boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  v yuplink.kit_order%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO v FROM yuplink.kit_order WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit_order_not_found'; END IF;
  IF v.status = 'released' THEN RAISE EXCEPTION 'kit_released'; END IF;
  IF v.status = 'granted' THEN
    RETURN QUERY SELECT 'granted'::text, false;
    RETURN;
  END IF;

  SELECT m.applied INTO v_ok
    FROM yuplink.acc_move(v.account_id, v.token, -v.price, 'acc_spend', v.pay_ref, v.wallet) AS m;
  RETURN QUERY SELECT 'reserved'::text, coalesce(v_ok, false);
END;
$function$;

-- Снять бронь: единица возвращается в тираж и лимит, а списанное по ключу
-- брони (и ещё не возвращённое) уходит назад на счёт — в ОДНОЙ транзакции,
-- поэтому «бронь снята, а деньги нет» не бывает. Выданную бронь не трогает
-- (r_status='granted'). Повтор безопасен: второй раз снимать и возвращать нечего.
CREATE OR REPLACE FUNCTION yuplink.kit_release(p_order text)
RETURNS TABLE (r_status text, r_refunded numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
  v yuplink.kit_order%ROWTYPE;
  v_paid numeric;
BEGIN
  SELECT * INTO v FROM yuplink.kit_order WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit_order_not_found'; END IF;
  IF v.status = 'granted' THEN
    RETURN QUERY SELECT 'granted'::text, 0::numeric;
    RETURN;
  END IF;

  IF v.status = 'reserved' THEN
    UPDATE yuplink.kit_order SET status = 'released', updated_at = now() WHERE id = p_order;
    UPDATE yuplink.kit SET sold = GREATEST(0, sold - 1), updated_at = now() WHERE id = v.kit_id;
  END IF;

  SELECT -l.delta INTO v_paid FROM yuplink.acc_ledger l
   WHERE l.kind = 'acc_spend' AND l.ref = v.pay_ref;
  IF v_paid > 0 AND NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger l
                                 WHERE l.kind = 'acc_refund' AND l.ref = v.pay_ref || '-undo') THEN
    PERFORM yuplink.acc_move(v.account_id, v.token, v_paid, 'acc_refund',
                             v.pay_ref || '-undo', v.wallet);
  ELSE
    v_paid := 0;
  END IF;

  RETURN QUERY SELECT 'released'::text, coalesce(v_paid, 0);
END;
$function$;

-- Владелец — как у всей схемы: приложение ходит под supabase_admin.
ALTER TABLE yuplink.kit       OWNER TO supabase_admin;
ALTER TABLE yuplink.kit_order OWNER TO supabase_admin;

COMMIT;
