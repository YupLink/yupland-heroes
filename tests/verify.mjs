const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error(e.message);process.exit(1)});
const db = new PGlite();
await db.exec(`CREATE SCHEMA yuplink;
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
 RETURNS TABLE(level integer,applied boolean) LANGUAGE sql AS $$ SELECT 0,false $$;`);
await db.exec(readFileSync(new URL('./townhall-original.sql',import.meta.url),'utf8'));
const migration=readFileSync(new URL('../migrations/townhall-02-atomic-legacy-purchases.sql',import.meta.url),'utf8');
await db.exec(migration); await db.exec(migration);
const cost=`'{"gold":100}'::jsonb`;
const calls={casino:a=>`SELECT * FROM yuplink.castle_casino_build('${a}',${cost},'casino:${a}')`,
 architect:a=>`SELECT * FROM yuplink.castle_architect_upgrade('${a}',0,${cost},'architect:${a}')`,
 auction:a=>`SELECT * FROM yuplink.castle_auction_house_upgrade('${a}',0,${cost},'auction:${a}')`,
 catalogue:a=>`SELECT * FROM yuplink.castle_building_buy('${a}','throne',${cost},1,1,ARRAY[8,15,22,29,36,43,50,57,64],0,'catalogue:${a}')`};
const scalar=async sql=>(await db.query(sql)).rows[0].n;
let cases=0;
// Both possible transaction orders for every pair sharing the final slot.
// PGlite is a single-connection runtime: actual overlapping sessions require PostgreSQL.
for(const [a,callA] of Object.entries(calls))for(const [b,callB] of Object.entries(calls)){
 if(a===b)continue;
 const account=a+'_'+b;
 await db.exec(`INSERT INTO yuplink.castle_building(account_id,kind) SELECT '${account}','fixture-'||i FROM generate_series(1,7) i`);
 assert.equal((await db.query(callA(account))).rows[0].applied,true);
 await assert.rejects(db.query(callB(account)),/townhall_no_slot:8:8/);
 assert.equal(await scalar(`SELECT yuplink.castle_slots_used('${account}') n`),8);
 assert.equal(await scalar(`SELECT count(*)::int n FROM yuplink.test_payments WHERE account_id='${account}'`),1);
 assert.equal((await db.query(callA(account))).rows[0].applied,false);
 cases++;
}
for(const [kind,fn] of [['architect','castle_architect_upgrade'],['auction','castle_auction_house_upgrade']]){
 const a=kind+'_catalogue';
 assert.equal((await db.query(`SELECT * FROM yuplink.${fn}('${a}',1,${cost},'upgrade:${a}')`)).rows[0].level,2);
 assert.equal(await scalar(`SELECT yuplink.castle_slots_used('${a}') n`),8);
 cases++;
}
// New level opens the next slot; another account remains independent.
await db.exec(`INSERT INTO yuplink.castle_townhall(account_id,level) VALUES ('casino_catalogue',2)`);
assert.equal((await db.query(calls.catalogue('casino_catalogue'))).rows[0].applied,true);
assert.equal((await db.query(calls.casino('independent'))).rows[0].applied,true);
// Lock order is shared townhall first, then legacy lock, then slot check, then debit.
for(const name of ['castle_casino_build','castle_architect_upgrade','castle_auction_house_upgrade']){
 const start=migration.indexOf('FUNCTION yuplink.'+name+'(');
 const sql=migration.slice(start,migration.indexOf('END $fn$;',start));
 assert(sql.indexOf("hashtext('townhall:'")<sql.indexOf('castle_assert_purchase_slot'));
 assert(sql.indexOf('castle_assert_purchase_slot')<sql.indexOf('yuplink.res_move'));
}
const runtime=readFileSync(new URL('../src/server/api/game-auction/house-fn.ts',import.meta.url),'utf8');
assert(runtime.includes('IF v_level = 0 THEN PERFORM yuplink.castle_assert_purchase_slot(p_account); END IF;'));
console.log(JSON.stringify({passed:cases+2,migrationAppliedTwice:true,actualConcurrentSessions:false}));
await db.close();
