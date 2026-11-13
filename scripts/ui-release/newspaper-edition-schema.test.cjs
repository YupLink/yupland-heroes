const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error(n);}});return exports;}
test('migration matches standalone SQL; concurrent initialization shares work, failure retries',async()=>{
 let calls=0,fail=true;
 const api=load('src/server/api/newspaper/edition-schema.ts',{'@/server/db/mcpClient':{mcpExec:async()=>{calls++;if(fail)throw Error('unavailable');}}});
 assert.equal(api.NEWSPAPER_EDITIONS_MIGRATION.trim(),fs.readFileSync(path.join(root,'migrations/newspaper-02-editions.sql'),'utf8').trim());
 const first=api.ensureNewspaperEditions(),second=api.ensureNewspaperEditions();assert.equal(first,second);await assert.rejects(first,/unavailable/);assert.equal(calls,1);
 fail=false;await Promise.all([api.ensureNewspaperEditions(),api.ensureNewspaperEditions()]);assert.equal(calls,2);await api.ensureNewspaperEditions();assert.equal(calls,2);
});
test('only authenticated consistent bilingual POSTs initialize schema; reads and legacy saves do not',async()=>{
 const events=[];let denied=false;
 const chain={inputValidator(){return this},handler:f=>f};
 const z=new Proxy(()=>z,{get:()=>z,apply:()=>z});
 const sql=new Proxy({},{get:(_,key)=>()=>String(key)});
 const api=load('src/server/api/newspaper/paper-editor.ts',{
  './edition-input':{newspaperEditionsInput:z},'./edition-schema':{ensureNewspaperEditions:async()=>events.push('schema')},
  '@tanstack/react-start':{createServerFn:()=>chain},zod:{z},'@/server/db/mcpClient':{mcpExec:async sql=>{events.push(sql);return [{id:'npi_test'}];}},
  '@/server/auth':{requireCastleEditor:async()=>{events.push('auth');if(denied)throw Error('forbidden');return 'editor';}},
  '@/lib/newspaper':{isNewspaperDate:()=>true,isNewspaperImageUrl:()=>true},'./paper-config':{},'./paper-sql':sql
 });
 const data={id:'npi_test',date:'2026-11-08',title:'RU',imageUrl:'/r.png',editions:{ru:{title:'RU',spreadUrls:['/r.png']},en:{title:'EN',spreadUrls:['/e.png']}}};
 denied=true;await assert.rejects(api.saveNewspaperIssue({data}),/forbidden/);assert.deepEqual(events,['auth']);
 denied=false;events.length=0;await assert.rejects(api.saveNewspaperIssue({data:{...data,imageUrl:'/wrong.png'}}),/bad_image/);assert.deepEqual(events,['auth']);
 events.length=0;await api.saveNewspaperIssue({data});assert.deepEqual(events,['auth','schema','saveIssueSql']);
 events.length=0;await api.saveNewspaperIssue({data:{...data,editions:undefined}});assert.deepEqual(events,['auth','saveIssueSql']);
 events.length=0;await api.listNewspaperIssues();assert.deepEqual(events,['auth','listIssuesSql']);
 events.length=0;await api.addNewspaperEnglish({data:{...data,expectedImageUrl:'/r.png'}});assert.deepEqual(events,['auth','schema','addIssueEnglishSql']);
 denied=true;events.length=0;await assert.rejects(api.addNewspaperEnglish({data:{...data,expectedImageUrl:'/r.png'}}),/forbidden/);assert.deepEqual(events,['auth']);
});
