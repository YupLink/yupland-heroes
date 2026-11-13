-- Промокоды на что угодно (владелец, 28–29.10.2026): админ заводит код прямо
-- в профиле, игрок вводит его там же. Код — на любой ресурс, токен, лайки,
-- энергию, товар, бокс, героя, артефакт или босса; количество — диапазоном
-- («1-10»), с шансом, с пределом игроков и/или объёма каждой строки.
--
-- 1. promo_code — сам код (верхний регистр, как у кодов на лайки), флаг,
--    предел игроков и счётчик вводов.
-- 2. promo_code_line — строки награды: вид + ссылка + диапазон + шанс +
--    объём за всё время (NULL — без предела) + сколько уже выдано.
-- 3. promo_redemption — одна активация на аккаунт и код И на Telegram и код
--    (расщеплённые аккаунты одного TG на проде есть — как у кодов на лайки):
--    что выпало (rolled), куда легло по строкам (delivered), ключ нажатия
--    (op), статус.
-- 4. promo_redeem(code, account, wallet, op, tg) — ВСЁ решение под локом кода:
--    повтор, тот же Telegram с другого аккаунта, флаг, предел игроков,
--    исчерпанный объём, бросок по строкам
--    (шанс, диапазон, срез остатком объёма), резерв объёма и запись
--    активации. Выдача — уже в коде, ключами от id активации (повтор не
--    удваивает); товар и босс без героя или места — в «Добычу» (raid_reward),
--    сбой выдачи — строка ждёт повторного ввода теми же ключами.
--
-- Старые коды на лайки (like_promocodes) не трогаем: профиль спрашивает
-- сначала новые, не нашёл — коды на лайки.
--
-- КАТИТЬ ДО КОДА. Без функции ручка ответит «кода нет» и профиль уйдёт к
-- кодам на лайки — старые коды живут, новые просто не находятся. Повтор
-- файла безвреден.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Код.
CREATE TABLE IF NOT EXISTS yuplink.promo_code (
  id          text PRIMARY KEY,
  code        text NOT NULL UNIQUE,            -- trim + верхний регистр (normalizePromoCode)
  active      boolean NOT NULL DEFAULT true,
  max_users   integer CHECK (max_users IS NULL OR max_users > 0),  -- NULL — без предела
  used_users  integer NOT NULL DEFAULT 0 CHECK (used_users >= 0),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Строки награды.
CREATE TABLE IF NOT EXISTS yuplink.promo_code_line (
  code_id     text NOT NULL REFERENCES yuplink.promo_code(id) ON DELETE CASCADE,
  idx         smallint NOT NULL CHECK (idx >= 0),
  kind        text NOT NULL CHECK (kind IN ('token', 'resource', 'likes', 'energy', 'custom',
                                            'pack', 'art', 'hero', 'boss')),
  ref_id      text,                            -- символ токена / код ресурса / id справочника
  title       text,                            -- имя из пикера: карточка игрока и «Добыча»
  image       text,
  amount_min  bigint NOT NULL CHECK (amount_min > 0),
  amount_max  bigint NOT NULL,
  chance      numeric(6, 3) NOT NULL DEFAULT 100 CHECK (chance > 0 AND chance <= 100),
  budget      bigint CHECK (budget IS NULL OR budget > 0),  -- объём строки за всё время
  given       bigint NOT NULL DEFAULT 0 CHECK (given >= 0),
  PRIMARY KEY (code_id, idx),
  CHECK (amount_max >= amount_min),
  CHECK (budget IS NULL OR given <= budget)
);

-- ── 3. Активации. Код с активациями не удаляется (FK) — только выключается.
CREATE TABLE IF NOT EXISTS yuplink.promo_redemption (
  id          text PRIMARY KEY,                -- 'prd_' || md5(код:аккаунт): одна на пару
  code_id     text NOT NULL REFERENCES yuplink.promo_code(id),
  account_id  text NOT NULL,
  wallet      text,
  telegram_id bigint,                          -- один TG — одна активация кода
  op          text NOT NULL,                   -- ключ нажатия: '<аккаунт>:<opId>'
  rolled      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{idx, kind, ref, title, image, amount}]
  delivered   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"<idx>": balance|backpack|inventory|harvest}
  status      text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz,
  UNIQUE (code_id, account_id)
);
-- Повтор файла поверх ранней редакции (колонки ещё не было) — безвреден.
ALTER TABLE yuplink.promo_redemption ADD COLUMN IF NOT EXISTS telegram_id bigint;
CREATE INDEX IF NOT EXISTS promo_redemption_account
  ON yuplink.promo_redemption (account_id, created_at);
-- Второй аккаунт того же Telegram — тот же человек: ввод кода один.
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemption_code_tg
  ON yuplink.promo_redemption (code_id, telegram_id) WHERE telegram_id IS NOT NULL;

-- ── 4. Ввод кода.
-- Ответ — jsonb: {error: not_found|inactive|exhausted|used} или активация
-- {id, code, status, same_op, was, rolled, delivered}. was = true — этот
-- аккаунт код уже вводил: отдаём ту же активацию (повтор моста, обрыв посреди
-- выдачи — код доделает недоставленное теми же ключами).
-- Ранняя редакция без Telegram (четыре аргумента) не должна жить перегрузкой.
DROP FUNCTION IF EXISTS yuplink.promo_redeem(text, text, text, text);
CREATE OR REPLACE FUNCTION yuplink.promo_redeem(
  p_code text, p_account text, p_wallet text, p_op text, p_tg bigint)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  c      yuplink.promo_code;
  prev   yuplink.promo_redemption;
  l      yuplink.promo_code_line;
  v_amt  bigint;
  v_rid  text;
  v_out  jsonb := '[]'::jsonb;
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
  FOR l IN SELECT * FROM yuplink.promo_code_line x WHERE x.code_id = c.id ORDER BY x.idx LOOP
    -- Шанс в процентах: 100 выпадает всегда (random() < 1).
    CONTINUE WHEN random() * 100 >= l.chance;
    -- Диапазон включительно: «1-10» даёт и 1, и 10.
    v_amt := l.amount_min + floor(random() * (l.amount_max - l.amount_min + 1))::bigint;
    -- Остаток объёма режет бросок; выбран — строка молчит.
    IF l.budget IS NOT NULL THEN
      v_amt := LEAST(v_amt, l.budget - l.given);
    END IF;
    CONTINUE WHEN v_amt <= 0;
    UPDATE yuplink.promo_code_line SET given = given + v_amt
     WHERE code_id = c.id AND idx = l.idx;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'idx', l.idx, 'kind', l.kind, 'ref', l.ref_id, 'title', l.title,
      'image', l.image, 'amount', v_amt));
  END LOOP;

  -- Ввод засчитан и тогда, когда ничего не выпало: шанс — часть кода.
  UPDATE yuplink.promo_code SET used_users = used_users + 1 WHERE id = c.id;
  INSERT INTO yuplink.promo_redemption (id, code_id, account_id, wallet, telegram_id, op, rolled)
  VALUES (v_rid, c.id, p_account, p_wallet, p_tg, p_op, v_out);
  RETURN jsonb_build_object('id', v_rid, 'code', c.code, 'status', 'reserved',
                            'same_op', true, 'was', false,
                            'rolled', v_out, 'delivered', '{}'::jsonb);
END $fn$;

COMMIT;
