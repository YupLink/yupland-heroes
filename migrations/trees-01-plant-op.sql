-- Посадка деревьев (владелец, 22.10.2026; lib/treePlant): ключ нажатия «Посадить
-- дерево». Строка ложится тем же оператором, что дерево на клетку, энергия и
-- минус штука из стопки рюкзака (tree-plant-sql): повтор того же нажатия видит
-- ключ и второе дерево не сажает, энергию второй раз не берёт; обрыв после
-- коммита ручка судит по нему же.
--
-- Товар «Дерево для посадки» (raid_market_item.kind = 'tree') и стопка рюкзака
-- (raid_hero_backpack.kind = 'tree', stack_key 'tree:<шаблон>') новых колонок и
-- проверок не требуют: kind в обеих таблицах — text без CHECK.
--
-- Строго ДО кода: без таблицы посадка отказывает целиком. Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_tree_plant_op (
  op         text        PRIMARY KEY,          -- 'tplant:<аккаунт>:<ключ нажатия>'
  account_id text        NOT NULL,
  map_id     text        NOT NULL,
  q          integer     NOT NULL,
  r          integer     NOT NULL,
  decor_id   text        NOT NULL,             -- шаблон дерева (mystic_item_template)
  paid       numeric     NOT NULL DEFAULT 0,   -- энергия за посадку
  at         timestamptz NOT NULL DEFAULT now()
);

-- Журнал «кто и где сажал» — для разбора жалоб и статистики.
CREATE INDEX IF NOT EXISTS raid_tree_plant_op_account
  ON yuplink.raid_tree_plant_op (account_id, at);
CREATE INDEX IF NOT EXISTS raid_tree_plant_op_cell
  ON yuplink.raid_tree_plant_op (map_id, q, r);

COMMIT;
