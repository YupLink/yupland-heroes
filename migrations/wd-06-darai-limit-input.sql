-- Лимит вывода DARAI = заведённое + 10 % (владелец, 23.10.2026; ПРАВИЛА §8.53):
-- «посчитать все введённые ресурсы как N и добавить к этому значению ещё 10 % — это
-- сумма, которую можно вывести»; «100 млн вкинул — могу вывести 100 млн + 10 % = 110 млн;
-- мин. сумма 10 млн (даже если не вносил); макс. сумма +100 млн (к тому, что вносил)»;
-- «у нас же на ввод ещё есть холдеры — юпики, которые заводят и получают от них DARAI в
-- стейкинг, — это тоже инвестирование, считать как ввод ресурсов».
--
-- Ступени 10 / 50 / 100 млн (wd-04) больше не действуют (настройка darai_withdraw_tiers
-- не читается). Меняется только darai_withdraw_cap — триггер лимита (wd-01/05) прежний:
-- лимит на календарный месяц UTC, выводы холдеров (wdh:) входят в выведенное, «только
-- своё» (darai_withdraw_own_only) и блок до 01.11 при базовом лимите — как были.
--
-- Окно ввода — 30 дней (как у ступеней). Ввод:
--   • DARAI, заведённые с кошелька (acc_deposit), — все, без вычета выведенного: иначе каждый
--     вывод урезал бы и сам лимит (вывел 50 из 110 — осталось бы 5, а не 60);
--   • USDT и звёзды, потраченные в игре (минус возвраты), — в DARAI по живому курсу Ref
--     (settings.darai_usd_rate), звезда = $0,013;
--   • номинал NFT-холдеров, заведённых в стейкинг банка (bank_stake.source = 'holder').
-- Своё = max(0, ввод до начала месяца − выведенное в окне до начала месяца) + ввод этого
-- месяца: ввод конца прошлого месяца, выведенный тогда же, не возвращается лимитом в новом
-- (находка ревью: 9 аккаунтов, ≈ 581 млн); прошлый вывод базовых 10 млн новый ввод не урезает.
-- Прибавка 10 % — от меньшего из «своего» и «пика»: наибольший чистый остаток DARAI по ходу
-- окна («заведено − выведено» бегущей суммой, не ниже нуля) + $/★ + холдеры. Без пика круг «завёл → вывел →
-- завёл те же» раздувал бы прибавку до +100 млн (находка ревью).
-- Лимит = max(10 млн, своё + min(10 % · база прибавки, 100 млн)).
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_cap(p_account text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_base numeric; v_rate numeric; v_from timestamptz; v_month timestamptz;
        u_prev numeric; u_cur numeric; s_prev numeric; s_cur numeric;
        d_prev numeric; d_cur numeric; w_prev numeric; v_peak numeric;
        h_prev numeric; h_cur numeric; v_own numeric; v_bonus numeric;
BEGIN
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_base <= 0 THEN RETURN NULL; END IF;  -- 0 — без лимита
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  v_from := now() - interval '30 days';
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- По токену отдельно — индекс (account_id, token, created_at).
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO u_prev, u_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'USDT' AND l.created_at > v_from
     AND l.kind IN ('acc_spend', 'acc_refund');
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO s_prev, s_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'STARS' AND l.created_at > v_from
     AND l.kind IN ('acc_spend', 'acc_refund');
  -- DARAI: заведено (до месяца / в месяце), выведено до месяца (минус отмены), пик остатка.
  SELECT COALESCE(sum(x.d) FILTER (WHERE x.kind = 'acc_deposit' AND x.created_at < v_month), 0),
         COALESCE(sum(x.d) FILTER (WHERE x.kind = 'acc_deposit' AND x.created_at >= v_month), 0),
         COALESCE(-sum(x.d) FILTER (WHERE x.kind <> 'acc_deposit' AND x.created_at < v_month), 0),
         GREATEST(0, COALESCE(max(x.kept), 0))
    INTO d_prev, d_cur, w_prev, v_peak
    -- kept — остаток «заведено − выведено», не ниже нуля (вывод заработанного сверх
    -- заведённого будущий ввод не съедает): бегущая сумма минус её худший минус до сих пор.
    FROM (SELECT y.kind, y.created_at, y.d,
                 y.run - LEAST(0, min(y.run) OVER (ORDER BY y.created_at, y.seq
                                                   ROWS UNBOUNDED PRECEDING)) AS kept
            FROM (SELECT l.kind, l.created_at, l.seq, l.delta AS d,
                         sum(l.delta) OVER (ORDER BY l.created_at, l.seq
                                            ROWS UNBOUNDED PRECEDING) AS run
                    FROM yuplink.acc_ledger l
                   WHERE l.account_id = p_account AND l.token = 'Darai' AND l.created_at > v_from
                     AND (l.kind IN ('acc_deposit', 'acc_withdraw')
                          OR (l.kind = 'acc_refund'
                              AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')))) y) x;
  SELECT COALESCE(sum(s.amount) FILTER (WHERE s.created_at < v_month), 0),
         COALESCE(sum(s.amount) FILTER (WHERE s.created_at >= v_month), 0)
    INTO h_prev, h_cur FROM yuplink.bank_stake s
   WHERE s.account_id = p_account AND s.source = 'holder' AND s.created_at > v_from;
  -- Возвраты больше трат — ноль, не минус.
  u_prev := GREATEST(0, u_prev) + GREATEST(0, s_prev) * 0.013;
  u_cur := GREATEST(0, u_cur) + GREATEST(0, s_cur) * 0.013;
  v_own := GREATEST(0, d_prev + u_prev * v_rate + h_prev - w_prev)
           + d_cur + u_cur * v_rate + h_cur;
  v_bonus := LEAST(LEAST(v_own, v_peak + (u_prev + u_cur) * v_rate + h_prev + h_cur) * 0.1,
                   100000000);
  RETURN GREATEST(v_base, floor(v_own + v_bonus));
END $fn$;

COMMIT;
