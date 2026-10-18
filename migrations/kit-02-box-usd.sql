-- Наборы = бокс, цена в $ как у подписки (владелец, 04.10.2026: «По факту это
-- и должен быть бокс. И назначить цену можно любую … звёзды, Darai и USDT …
-- по принципу, как сделаны подписки … лимит на аккаунт»).
--
-- НАКАТЫВАТЬ ДО ВЫКАТА КОДА. Схему меняет только на пустых таблицах (на проде
-- наборов и броней ноль; есть хоть одна строка — миграция откатится целиком).
-- Пока новый код не выехал, старый не покажет витрину (колонок нет), а покупка
-- откажет ещё ДО денег: kit_reserve на 6 аргументов больше нет.
--
-- Набор теперь — бокс из конструктора боксов (chip_packs, kind='mystic') × N
-- штук за цену в $. Название и картинка — у бокса, своих у набора нет. Платят
-- со счёта USDT, DARAI (плавающая цена по курсу) или Stars: сумму к оплате
-- считает сервер (lib/energySub.ts::priceIn) и передаёт в kit_reserve, а та
-- сверяет цену набора в $ с той, что видел сервер, бокс и количество — с теми,
-- что видел игрок, и пишет СНИМОК брони: валюта, сумма, цена в $, бокс и
-- количество. kit_pay списывает сумму снимка.
--
-- Порядок замков и самопочинка — как в kit-01: набор → бронь (kit_reserve),
-- бронь → счёт (kit_pay, kit_release).
BEGIN;
SET lock_timeout = '5s';

LOCK TABLE yuplink.kit, yuplink.kit_order IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.kit) OR EXISTS (SELECT 1 FROM yuplink.kit_order) THEN
    RAISE EXCEPTION 'kit-02: наборы или брони уже есть — схема меняется только на пустых таблицах';
  END IF;
END
$guard$;

-- Набор: бокс × N за цену в $. Ссылка на бокс — внешним ключом: бокс, который
-- продаётся набором (или был куплен в наборе), не удаляется.
ALTER TABLE yuplink.kit
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS name_en,
  DROP COLUMN IF EXISTS image,
  DROP COLUMN IF EXISTS contents,
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS price,
  ADD COLUMN IF NOT EXISTS box_id    text NOT NULL REFERENCES yuplink.chip_packs(id),
  ADD COLUMN IF NOT EXISTS box_count int NOT NULL DEFAULT 1 CHECK (box_count >= 1),
  ADD COLUMN IF NOT EXISTS price_usd numeric(12,2) NOT NULL CHECK (price_usd > 0);

-- Бронь: снимок того, что игрок оплачивает. Правка набора потом его не меняет.
ALTER TABLE yuplink.kit_order
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS name_en,
  DROP COLUMN IF EXISTS contents,
  DROP COLUMN IF EXISTS price,
  ADD COLUMN IF NOT EXISTS amount    numeric(38,8) NOT NULL CHECK (amount > 0),
  ADD COLUMN IF NOT EXISTS price_usd numeric(12,2) NOT NULL CHECK (price_usd > 0),
  ADD COLUMN IF NOT EXISTS box_id    text NOT NULL REFERENCES yuplink.chip_packs(id),
  ADD COLUMN IF NOT EXISTS box_count int NOT NULL CHECK (box_count >= 1);
ALTER TABLE yuplink.kit_order DROP CONSTRAINT IF EXISTS kit_order_token_check;
ALTER TABLE yuplink.kit_order
  ADD CONSTRAINT kit_order_token_check CHECK (token IN ('USDT', 'Darai', 'STARS'));

-- Бронь единицы набора — ДО денег. Сумму к оплате (p_amount, в валюте p_token)
-- считает сервер по цене набора в $ (p_price_usd); бокс и количество
-- (p_box_id, p_box_count) — те, что игрок видел на витрине. Отказы:
-- kit_not_found, kit_off, kit_price_changed (цена в $ уже другая), kit_changed
-- (админ сменил бокс или количество), kit_sold_out, kit_limit. Повтор с тем же
-- p_ref возвращает прежнюю бронь (r_fresh=false) в любом её статусе — со своим
-- снимком, а не с новыми аргументами.
DROP FUNCTION IF EXISTS yuplink.kit_reserve(text, text, text, text, text, numeric);
CREATE OR REPLACE FUNCTION yuplink.kit_reserve(
  p_kit text, p_account text, p_wallet text, p_ref text,
  p_token text, p_amount numeric, p_price_usd numeric, p_box_id text, p_box_count int
) RETURNS TABLE (
  r_id text, r_status text, r_token text, r_amount numeric, r_fresh boolean,
  r_price_usd numeric, r_box_id text, r_box_count int
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_kit yuplink.kit%ROWTYPE;
  v_old yuplink.kit_order%ROWTYPE;
  v_mine int;
  v_id text;
  v_amount numeric := round(p_amount, 8);
BEGIN
  IF coalesce(p_ref, '') = '' OR coalesce(p_account, '') = ''
     OR coalesce(p_token, '') NOT IN ('USDT', 'Darai', 'STARS')
     OR coalesce(v_amount, 0) <= 0 OR coalesce(p_price_usd, 0) <= 0
     OR coalesce(p_box_id, '') = '' OR coalesce(p_box_count, 0) < 1 THEN
    RAISE EXCEPTION 'kit_bad_call';
  END IF;

  -- Замок набора: покупки одного набора идут по очереди. Каждый запрос ниже
  -- берёт свежий снимок и видит брони, закоммиченные до получения замка.
  SELECT * INTO v_kit FROM yuplink.kit WHERE id = p_kit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit_not_found'; END IF;

  SELECT * INTO v_old FROM yuplink.kit_order WHERE pay_ref = p_ref;
  IF FOUND THEN
    RETURN QUERY SELECT v_old.id, v_old.status, v_old.token, v_old.amount, false,
                        v_old.price_usd, v_old.box_id, v_old.box_count;
    RETURN;
  END IF;

  IF NOT v_kit.active THEN RAISE EXCEPTION 'kit_off'; END IF;
  IF v_kit.price_usd IS DISTINCT FROM p_price_usd THEN RAISE EXCEPTION 'kit_price_changed'; END IF;
  -- Игрок платит за то, что видел: бокс или количество сменили — отказ до денег.
  IF v_kit.box_id IS DISTINCT FROM p_box_id OR v_kit.box_count IS DISTINCT FROM p_box_count THEN
    RAISE EXCEPTION 'kit_changed';
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
    (id, kit_id, account_id, wallet, token, amount, price_usd, box_id, box_count, pay_ref)
  VALUES
    (v_id, v_kit.id, p_account, p_wallet, p_token, v_amount, v_kit.price_usd,
     v_kit.box_id, v_kit.box_count, p_ref);
  UPDATE yuplink.kit SET sold = sold + 1, updated_at = now() WHERE id = p_kit;

  RETURN QUERY SELECT v_id, 'reserved'::text, p_token, v_amount, true,
                      v_kit.price_usd, v_kit.box_id, v_kit.box_count;
END;
$function$;

-- Оплатить бронь: списание по ключу брони, сумма и валюта — из снимка брони
-- (не аргумент вызова). Только пока бронь «reserved» и под её замком: снятая
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
    FROM yuplink.acc_move(v.account_id, v.token, -v.amount, 'acc_spend', v.pay_ref, v.wallet) AS m;
  RETURN QUERY SELECT 'reserved'::text, coalesce(v_ok, false);
END;
$function$;

-- Снять бронь: единица возвращается в тираж и лимит, а списанное по ключу
-- брони (и ещё не возвращённое) уходит назад на счёт — в ОДНОЙ транзакции.
-- Выданную бронь не трогает (r_status='granted'). Повтор безопасен. Тело —
-- как в kit-01: пересоздаётся под новую строку брони.
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

COMMIT;
