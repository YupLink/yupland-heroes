-- Идемпотентность вклада в рюкзак героя.
--
-- depositToBackpack поднимает count на qty (ON CONFLICT DO UPDATE). Мост к БД
-- ретраит запрос вслепую, и потерянный ответ ПОСЛЕ выполнения удваивал стек:
-- игрок платил один раз, а предметов получал вдвое. Ключ операции — nonce
-- покупки, тот же, что в id ячейки.
CREATE TABLE IF NOT EXISTS yuplink.raid_backpack_op (
  op text PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);
