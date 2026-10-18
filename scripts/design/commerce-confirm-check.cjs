const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/node_modules/typescript'),jsx=require(root+'/node_modules/react/jsx-runtime');
function load(file,imports,extra=''){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:id=>{if(!(id in imports))throw Error(id);return imports[id]}});return exports;}
function flat(n){if(!n)return[];if(Array.isArray(n))return n.flatMap(flat);return typeof n==='object'?[n,...flat(n.props?.children)]:[];}
function text(n){if(n==null)return'';if(Array.isArray(n))return n.map(text).join(' ');return typeof n==='object'?text(n.props?.children):String(n);}
let lang='ru',calls=0,pending=false;
const rule=load('src/lib/heroLevels.ts',{});
const common={'react/jsx-runtime':jsx,react:{useState:()=>[null,()=>{}]},'@/lib/i18n':{useLang:()=>lang},'@/lib/image':{},'@/lib/humanError':{},'@/lib/query':{},'lucide-react':{Crown:'span',Loader2:'span',Sparkles:'span'},sonner:{toast:{}},'@/lib/heroLevels':rule,'./HeroRadar':{},'./heroLabels':{RARITY_COLOR:{},RARITY_LABEL:{rare:'Редкий'}},'@/components/ui/button':{Button:'button'},'@/server/api/heroes':{convertChipToHero:()=>calls++},'@tanstack/react-query':{useQueryClient:()=>({}),useMutation:o=>({isPending:pending,mutate:o.mutationFn})}};
const Modal=load('src/components/heroes/ConvertToHeroModal.tsx',common).ConvertToHeroModal;
for(lang of ['ru','en'])for(const level of [3,4,5]){
 const tree=Modal({chipId:'chosen',chipLevel:level,chipName:'Test chip',onClose:()=>{}});
 const price=rule.convertRuleForChipLevel(level).likes;const buttons=flat(tree).filter(n=>n.type==='button');
 assert(text(tree).includes(lang==='ru'?'Отменить превращение нельзя':'cannot be undone'));
 assert(text(buttons[1]).includes(String(price)));const before=calls;buttons[0].props.onClick();assert.equal(calls,before);buttons[1].props.onClick();assert.equal(calls,before+1);
}
pending=true;let tree=Modal({chipId:'chosen',chipLevel:3,chipName:'Test',onClose:()=>{}});assert.equal(tree.props.onClick,undefined);assert(flat(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));pending=false;
let selection=null;
const imports={...common,react:{useState:()=>[selection,v=>selection=v]},'@/lib/utils':{},'@/server/api/chips':{},'./ConvertToHeroModal':{ConvertToHeroModal:Modal},'@tanstack/react-query':{useQuery:()=>({data:[{count:1,level:3,chipIds:['chosen'],templateName:'Test',templateId:'t'}]}),useMutation:()=>{throw Error('Direct conversion bypass')},useQueryClient:()=>({})}};
const Block=load('src/components/heroes/MyHeroesPanel.tsx',imports,'\nexport { ConvertBlock };').ConvertBlock;
const before=calls;flat(Block({onDone:()=>{}})).find(n=>n.type==='button').props.onClick();assert.equal(calls,before);assert.equal(selection.id,'chosen');assert(flat(Block({onDone:()=>{}})).some(n=>n.type===Modal));
let balance={data:{available:12,availableRaw:12.75},isPending:false,isError:false};
const Balance=load('src/components/chips/TicketBalance.tsx',{...common,'@/lib/hooks/useTickets':{useTickets:()=>balance}}).TicketBalance;
assert(text(Balance()).includes('12.75'));balance={isPending:true};assert(text(Balance()).includes('…'));balance={isError:true};assert(flat(Balance()).some(n=>n.type==='button'));assert(!text(Balance()).includes('0'));
console.log('PASS actual components: card opens confirmation without mutation; exact price RU/EN for 3/4/5; cancel has no spend; pending locked; fractional ticket balance and loading/error states');

if(process.env.VISUAL_CHECK) (async()=>{
 const {chromium}=require(process.env.YUPLINK_TEST_PLAYWRIGHT || 'playwright');
 const {renderToStaticMarkup}=require(root+'/node_modules/react-dom/server');
 const css=fs.readFileSync(process.env.YUPLINK_TEST_CSS || root+'/design/dist/assets/'+fs.readdirSync(root+'/design/dist/assets').find(n=>n.endsWith('.css')),'utf8');
 const browser=await chromium.launch({headless:true});
 try{for(lang of ['ru','en'])for(const width of [360,1280]){
 const page=await browser.newPage({viewport:{width,height:640}});await page.route('**/*',r=>r.abort());
 await page.setContent('<style>'+css+'</style>'+renderToStaticMarkup(Modal({chipId:'chosen',chipLevel:5,chipName:'Long chip name / Длинное название фишки',onClose:()=>{}})));
 const confirm=page.getByRole('button',{name:lang==='ru'?'Превратить за 5000 лайков':'Convert for 5000 likes'});
 const b=await confirm.boundingBox();assert(b && b.height>=44 && b.x>=0 && b.x+b.width<=width && b.y+b.height<=640);
 await page.screenshot({path:require('node:os').tmpdir()+'/hero-confirm-'+width+'-'+lang+'.png'});await page.close();
 }console.log('PASS confirmation browser layout RU/EN 360/1280px');}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
