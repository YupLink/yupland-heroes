const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../src/components/newspaper/calendar.ts'),'utf8');const calendar={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:calendar,Date});
test('October 2026 fits five weeks, starts Thursday, includes every day once',()=>{const c=calendar.calendarCells('2026-10');assert.equal(c.length,35);assert.equal(c[3].date,'2026-10-01');assert.equal(c[33].date,'2026-10-31');assert.equal(new Set(c.filter(Boolean).map(x=>x.date)).size,31);});
test('six-week month is complete',()=>{const c=calendar.calendarCells('2026-11');assert.equal(c.length,42);assert.equal(c[6].day,1);assert.equal(c[35].day,30);});
test('leap February and year navigation use UTC',()=>{assert.equal(calendar.calendarCells('2028-02').filter(Boolean).length,29);assert.equal(calendar.monthOffset('2026-01',-1),'2025-12');assert.equal(calendar.monthOffset('2026-12',1),'2027-01');});
