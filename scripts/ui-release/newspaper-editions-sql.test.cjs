const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),sql={};
const mocks={'@/server/api/beta-raid/sight/sight-sql':{sightRadiusSql:()=> '5'},'@/server/api/raid-shared':{sqlStr:s=>"'"+s.replaceAll("'","''")+"'"},'@/lib/lootBag':{LOOT_BAG_SEE:5},'@/server/api/beta-raid/cell-sql':{WATER_SQL:'false',buildingHeldSql:()=> 'false'},'@/server/api/beta-raid/voidCells':{voidSql:()=> 'false'},'@/server/api/beta-raid/loot-bag/bag-read-sql':{distSql:()=> '0',hiddenSql:()=> ''}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/server/api/newspaper/paper-sql.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:sql,require:n=>{if(n in mocks)return mocks[n];throw Error(n);}});
const editions={ru:{title:'RU',spreadUrls:['/r.png']},en:{title:'EN',spreadUrls:['/e.png']}};
test('read projections remain compatible before the additive migration',()=>{assert.match(sql.listIssuesSql(),/to_jsonb\(i\)->'editions'/);});
test('real PostgreSQL: bilingual saves, idempotency, conflict and adding EN preserve issue state',{skip:!process.env.NEWSPAPER_TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.NEWSPAPER_TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/newspaper_test');
 const {Client}=require('pg'),db=new Client({connectionString:url.href});await db.connect();
 try{
 await db.query('CREATE SCHEMA yuplink; CREATE TABLE yuplink.newspaper_issue(id text PRIMARY KEY, issue_date date,title text,image_url text,created_by text,status text NOT NULL DEFAULT \'draft\',created_at timestamptz DEFAULT now(),published_at timestamptz); CREATE TABLE yuplink.newspaper_copy(issue_id text); CREATE TABLE yuplink.newspaper_read(issue_id text,read_at timestamptz);');
 assert.deepEqual((await db.query(sql.listIssuesSql())).rows,[]);
 await db.query(fs.readFileSync(path.join(root,'migrations/newspaper-02-editions.sql'),'utf8'));
 await db.query(fs.readFileSync(path.join(root,'migrations/newspaper-02-editions.sql'),'utf8'));
 const column=(await db.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='yuplink' AND table_name='newspaper_issue' AND column_name='editions'")).rows[0];assert.deepEqual(column,{data_type:'jsonb',is_nullable:'YES'});
 const v={id:'npi_test1',date:'2026-11-08',title:'RU',imageUrl:'/r.png',by:'editor',editions,createOnly:true};
 assert.equal((await db.query(sql.saveIssueSql(v))).rowCount,1);
 assert.equal((await db.query(sql.saveIssueSql(v))).rowCount,1);
 assert.equal((await db.query(sql.saveIssueSql({...v,editions:{...editions,en:{title:'Changed',spreadUrls:['/new.png']}}}))).rowCount,0);
 assert.equal((await db.query(sql.saveIssueSql({...v,editions:undefined,createOnly:false,imageUrl:'/changed.png'}))).rowCount,0);
 assert.deepEqual((await db.query(sql.listIssuesSql())).rows[0].editions,editions);
 const legacy={id:'npi_old',date:'2026-11-07',title:'RU',imageUrl:'/r.png',by:'editor'};
 await db.query(sql.saveIssueSql(legacy));assert.equal((await db.query(sql.saveIssueSql(legacy))).rowCount,1);
 await db.query("UPDATE yuplink.newspaper_issue SET status='published' WHERE id='npi_old'; INSERT INTO yuplink.newspaper_copy VALUES('npi_old'); INSERT INTO yuplink.newspaper_read VALUES('npi_old',now());");
 const add={id:'npi_old',expectedImageUrl:'/r.png',editions};
 assert.equal((await db.query(sql.addIssueEnglishSql({...add,editions:{...editions,ru:{title:'RU',spreadUrls:['/changed.png']}}}))).rowCount,0);
 assert.equal((await db.query(sql.addIssueEnglishSql(add))).rowCount,1);
 assert.equal((await db.query(sql.addIssueEnglishSql(add))).rowCount,1);
 assert.equal((await db.query(sql.addIssueEnglishSql({...add,editions:{...editions,en:{title:'Changed',spreadUrls:['/other.png']}}}))).rowCount,0);
 const row=(await db.query(sql.listIssuesSql())).rows.find(r=>r.id==='npi_old');assert.equal(row.imageUrl,'/r.png');assert.equal(row.copies,1);assert.equal(row.reads,1);assert.equal(row.status,'published');
 }finally{await db.query('DROP SCHEMA IF EXISTS yuplink CASCADE');await db.end();}
});
