-- Один аккаунт на Telegram / Google / кошелёк (владелец, 06.11.2026: «3 — да»,
-- «4 — да, только один акк на тг/гугл акк/кош»; «где больше ресов — тот и
-- остаётся, на втором данные в архив падают — что там было, но чтобы вход был
-- только по основному акку… не суммируются данные — только через поддержку»).
--
-- Архив = аккаунт без ключей входа. Его вещи и балансы НЕ трогаются: владелец у
-- них — account_id, и штамп ставится один раз (stamp_account_id срабатывает,
-- только когда account_id пуст или сменился кошелёк строки). Переезжают ключи:
-- кошельки (users.account_id) и Telegram аккаунта (accounts.telegram_id). Вход
-- через Google и по кошельку идёт через users — значит, тоже на основной.
-- Журнал хранит, что было; поддержка может сделать основным архивный
-- (account_make_main) — тогда в архив уходит нынешний основной.
--
-- «Больше ресурсов» = больше видов ресурсов, где у аккаунта больше (золото,
-- алмазы, дерево, камень, DARAI, USDT, герои, фишки, артефакты, постройки замка,
-- лайки, энергия, билеты). Ничья — кто позже был в игре, потом у кого Telegram в
-- аккаунте, потом кто старше. Цен между ресурсами не вводим.
-- Применять ДО кода. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.accounts
  ADD COLUMN IF NOT EXISTS archived_into text REFERENCES yuplink.accounts(id),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS yuplink.account_archive_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  account_id  text NOT NULL REFERENCES yuplink.accounts(id),
  into_id     text NOT NULL REFERENCES yuplink.accounts(id),
  reason      text NOT NULL,
  score       jsonb,
  snapshot    jsonb NOT NULL,
  restored_at timestamptz
);
CREATE INDEX IF NOT EXISTS account_archive_log_acc ON yuplink.account_archive_log (account_id, at DESC);

CREATE OR REPLACE FUNCTION yuplink.account_wealth(p_acc text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'gold',     coalesce((SELECT sum(amount) FROM yuplink.account_resources WHERE account_id = p_acc AND resource = 'gold'), 0),
    'diamonds', coalesce((SELECT sum(amount) FROM yuplink.account_resources WHERE account_id = p_acc AND resource = 'diamonds'), 0),
    'wood',     coalesce((SELECT sum(amount) FROM yuplink.account_resources WHERE account_id = p_acc AND resource = 'wood'), 0),
    'stone',    coalesce((SELECT sum(amount) FROM yuplink.account_resources WHERE account_id = p_acc AND resource = 'stone'), 0),
    'darai',    coalesce((SELECT sum(delta) FROM yuplink.acc_ledger WHERE account_id = p_acc AND token = 'Darai'), 0),
    'usdt',     coalesce((SELECT sum(delta) FROM yuplink.acc_ledger WHERE account_id = p_acc AND token = 'USDT'), 0),
    'heroes',   (SELECT count(*) FROM yuplink.hero_instance WHERE account_id = p_acc),
    'chips',    (SELECT count(*) FROM yuplink.user_chip_inventory WHERE account_id = p_acc AND status <> 'burned'),
    'artifacts',(SELECT count(*) FROM yuplink.user_game_item WHERE account_id = p_acc AND kind = 'artifact'),
    'castle',   (SELECT count(*) FROM yuplink.castle_building WHERE account_id = p_acc),
    'likes',    coalesce((SELECT likes FROM yuplink.account_balances WHERE account_id = p_acc), 0),
    'energy',   coalesce((SELECT energy FROM yuplink.account_balances WHERE account_id = p_acc), 0),
    'tickets',  coalesce((SELECT tickets FROM yuplink.account_balances WHERE account_id = p_acc), 0)
  );
$$;

/** Какой из двух остаётся основным. */
CREATE OR REPLACE FUNCTION yuplink.account_pick_main(a text, b text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  wa jsonb := yuplink.account_wealth(a);
  wb jsonb := yuplink.account_wealth(b);
  k text; sa int := 0; sb int := 0;
  ra yuplink.accounts; rb yuplink.accounts;
BEGIN
  FOR k IN SELECT jsonb_object_keys(wa) LOOP
    IF (wa->>k)::numeric > (wb->>k)::numeric THEN sa := sa + 1;
    ELSIF (wb->>k)::numeric > (wa->>k)::numeric THEN sb := sb + 1; END IF;
  END LOOP;
  IF sa <> sb THEN RETURN CASE WHEN sa > sb THEN a ELSE b END; END IF;
  SELECT * INTO ra FROM yuplink.accounts WHERE id = a;
  SELECT * INTO rb FROM yuplink.accounts WHERE id = b;
  IF coalesce(ra.last_seen_at, '-infinity') <> coalesce(rb.last_seen_at, '-infinity') THEN
    RETURN CASE WHEN coalesce(ra.last_seen_at, '-infinity') > coalesce(rb.last_seen_at, '-infinity') THEN a ELSE b END;
  END IF;
  IF (ra.telegram_id IS NULL) <> (rb.telegram_id IS NULL) THEN
    RETURN CASE WHEN ra.telegram_id IS NOT NULL THEN a ELSE b END;
  END IF;
  RETURN CASE WHEN ra.created_at <= rb.created_at THEN a ELSE b END;
END $$;

/** Ключи p_from → на p_into, p_from — в архив. Вещи не двигаются. */
CREATE OR REPLACE FUNCTION yuplink.account_archive_into(p_from text, p_into text, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE f yuplink.accounts; i yuplink.accounts; syn constant bigint := 4503599627370496;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'archive: один и тот же аккаунт'; END IF;
  -- Порядок блокировок — по id, чтобы встречные слияния не ловили взаимную блокировку.
  PERFORM 1 FROM yuplink.accounts WHERE id IN (p_from, p_into) ORDER BY id FOR UPDATE;
  SELECT * INTO f FROM yuplink.accounts WHERE id = p_from;
  SELECT * INTO i FROM yuplink.accounts WHERE id = p_into;
  IF f.id IS NULL OR i.id IS NULL THEN RAISE EXCEPTION 'archive: нет аккаунта'; END IF;
  IF f.archived_into IS NOT NULL THEN RETURN; END IF;
  IF i.archived_into IS NOT NULL THEN RAISE EXCEPTION 'archive: основной сам в архиве'; END IF;

  INSERT INTO yuplink.account_archive_log (account_id, into_id, reason, score, snapshot)
  VALUES (p_from, p_into, p_reason,
    jsonb_build_object('from', yuplink.account_wealth(p_from), 'into', yuplink.account_wealth(p_into)),
    jsonb_build_object(
      'telegram_id', f.telegram_id, 'active_wallet', f.active_wallet, 'into_telegram_id', i.telegram_id,
      'wallets', coalesce((SELECT jsonb_agg(wallet ORDER BY wallet) FROM yuplink.users WHERE account_id = p_from), '[]'::jsonb)));

  UPDATE yuplink.users SET account_id = p_into WHERE account_id = p_from;
  UPDATE yuplink.accounts SET telegram_id = NULL, archived_into = p_into, archived_at = now() WHERE id = p_from;
  -- Telegram аккаунта: у основного пусто — берёт этот; у основного номер Google/кошелька,
  -- а у архивного настоящий Telegram — настоящий важнее (вывод и бот — по нему).
  IF f.telegram_id IS NOT NULL AND (i.telegram_id IS NULL OR (i.telegram_id >= syn AND f.telegram_id < syn)) THEN
    UPDATE yuplink.accounts SET telegram_id = f.telegram_id WHERE id = p_into;
  END IF;
  -- Вклады в архиве, у которых он сам основной, — к новому основному (цепочек нет).
  UPDATE yuplink.accounts SET archived_into = p_into WHERE archived_into = p_from;
END $$;

/** Два аккаунта → один по правилу (привязка ключа из профиля). Возвращает основной. */
CREATE OR REPLACE FUNCTION yuplink.account_merge_by_rule(a text, b text, p_reason text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
  a := coalesce((SELECT archived_into FROM yuplink.accounts WHERE id = a), a);
  b := coalesce((SELECT archived_into FROM yuplink.accounts WHERE id = b), b);
  IF a = b THEN RETURN a; END IF;
  m := yuplink.account_pick_main(a, b);
  PERFORM yuplink.account_archive_into(CASE WHEN m = a THEN b ELSE a END, m, p_reason);
  RETURN m;
END $$;

/** Все аккаунты одного Telegram → один основной. Возвращает основной (или NULL). */
CREATE OR REPLACE FUNCTION yuplink.account_one_per_tg(p_tg bigint, p_reason text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE ids text[]; m text; x text;
BEGIN
  SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM (
    SELECT account_id AS id FROM yuplink.users WHERE telegram_id = p_tg AND account_id IS NOT NULL
    UNION SELECT id FROM yuplink.accounts WHERE telegram_id = p_tg) s
  WHERE id IN (SELECT id FROM yuplink.accounts WHERE archived_into IS NULL);
  -- Кошелёк, что встал на аккаунт в момент его ухода в архив, — к основному.
  UPDATE yuplink.users u SET account_id = a.archived_into
    FROM yuplink.accounts a
   WHERE u.account_id = a.id AND a.archived_into IS NOT NULL AND u.telegram_id = p_tg;
  IF ids IS NULL OR cardinality(ids) < 2 THEN RETURN ids[1]; END IF;
  m := ids[1];
  FOREACH x IN ARRAY ids[2:] LOOP m := yuplink.account_pick_main(m, x); END LOOP;
  FOREACH x IN ARRAY ids LOOP
    IF x <> m THEN PERFORM yuplink.account_archive_into(x, m, p_reason); END IF;
  END LOOP;
  RETURN m;
END $$;

/**
 * Поддержка: правило выбрало не тот аккаунт — сделать основным архивный. Один аккаунт
 * на ключ сохраняется: нынешний основной уходит в архив, все ключи — на этот.
 */
CREATE OR REPLACE FUNCTION yuplink.account_make_main(p_acc text, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
  SELECT archived_into INTO m FROM yuplink.accounts WHERE id = p_acc FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'make_main: аккаунт не в архиве'; END IF;
  UPDATE yuplink.accounts SET archived_into = NULL, archived_at = NULL WHERE id = p_acc;
  UPDATE yuplink.account_archive_log SET restored_at = now()
   WHERE account_id = p_acc AND restored_at IS NULL;
  PERFORM yuplink.account_archive_into(m, p_acc, p_reason);
END $$;

COMMIT;
