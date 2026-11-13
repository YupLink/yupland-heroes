-- Isolated CI database only. Test doubles for resource and goods debits.
CREATE SCHEMA yuplink;
CREATE TABLE yuplink.castle_temple(account_id text,level int);
CREATE TABLE yuplink.castle_temple_op(account_id text,kind text);
CREATE TABLE yuplink.castle_casino(account_id text PRIMARY KEY, op_id text, cost jsonb);
CREATE TABLE yuplink.castle_architect(account_id text PRIMARY KEY, level int DEFAULT 0, updated_at timestamptz);
CREATE TABLE yuplink.castle_architect_op(op_id text PRIMARY KEY, account_id text, kind text, detail jsonb);
CREATE TABLE yuplink.castle_auction_house(account_id text PRIMARY KEY, level int DEFAULT 0, updated_at timestamptz);
CREATE TABLE yuplink.castle_auction_house_op(op_id text PRIMARY KEY, account_id text, detail jsonb);
CREATE TABLE yuplink.test_payments(account_id text, resource text, amount numeric, op text UNIQUE);
CREATE FUNCTION yuplink.res_move(text,text,numeric,text,text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO yuplink.test_payments VALUES ($1,$2,$3,$5) ON CONFLICT DO NOTHING;
$$;
CREATE FUNCTION yuplink.castle_architect_take_goods(text,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
CREATE FUNCTION yuplink.castle_architect_upgrade(text,integer,jsonb,text,text DEFAULT NULL)
 RETURNS TABLE(level integer,applied boolean) LANGUAGE sql AS $$ SELECT 0,false $$;
