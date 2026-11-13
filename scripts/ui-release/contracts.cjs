const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const dependency = createRequire(path.resolve(process.env.UI_CHECK_DEPS || '.', 'package.json'));
const ts = dependency('typescript');
const postcss = dependency('postcss');
const sourceExt = /\.(?:[cm]?[jt]sx?|css)$/;
const resourceExt = /\.(?:png|webp|jpe?g|svg|gif|avif|woff2?|ttf|ogg|mp3|wav|mp4)(?:[?#].*)?$/i;
function checkFiles(files, read, entries) {
  const errors = [], seen = new Set(), pending = [...entries];
  function reference(from, spec) {
    if (/^(?:https?:|data:|blob:|#)/.test(spec)) return;
    const clean = spec.split(/[?#]/)[0];
    if (!clean.startsWith('.') && !clean.startsWith('@/') && !clean.startsWith('/')) return;
    const base = clean.startsWith('@/') ? 'src/' + clean.slice(2) : clean.startsWith('/') ? 'public' + clean : path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
    const candidates = [base, ...['.ts','.tsx','.js','.jsx','.mjs','.json','.css'].map(e=>base+e), ...['.ts','.tsx','.js','.jsx'].map(e=>base+'/index'+e)];
    if (/\.js$/.test(base)) candidates.push(base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx');
    const found = candidates.find(f=>files.has(f));
    if (!found) errors.push(`${from}: missing tracked dependency ${spec}`);
    else if (sourceExt.test(found)) pending.push(found);
  }
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name) || !sourceExt.test(name)) continue;
    seen.add(name);
    if (!files.has(name)) { errors.push(`Missing entry ${name}`); continue; }
    const text = read(name);
    if (name.endsWith('.css')) {
      const css = postcss.parse(text, {from:name});
      css.walkDecls(d=>{for(const m of d.value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) reference(name,m[1]);});
      css.walkAtRules('import',r=>{const m=r.params.match(/^["']([^"']+)/);if(m)reference(name,m[1]);});
    } else {
      const ast = ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true);
      function visit(n) {
        if ((ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) reference(name,n.moduleSpecifier.text);
        if (ts.isCallExpression(n) && (n.expression.kind===ts.SyntaxKind.ImportKeyword || n.expression.getText(ast)==='require') && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) reference(name,n.arguments[0].text);
        if ((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) && resourceExt.test(n.text) && !/^\.[a-z0-9]+$/i.test(n.text)) reference(name,n.text);
        ts.forEachChild(n,visit);
      }
      visit(ast);
    }
  }
  return {errors, scanned:seen.size};
}
const auction = 'src/components/chips/auctions/';
function checkStyles(read) {
  const errors=[];
  const approved=postcss.parse(read(auction+'auction-approved.css'));
  approved.walkRules(rule=>{
    if (rule.parent.type==='atrule' && /keyframes$/.test(rule.parent.name)) return;
    for(const selector of rule.selectors) {
      if (/\.auction-window\b/.test(selector) && !selector.startsWith('.auction-window.auction-window--approved')) errors.push(`Unscoped player styling: ${selector}`);
      if (/\.auction-lot\b/.test(selector) && !selector.startsWith('.auction-window.auction-window--approved')) errors.push(`Shared lot styling leaked: ${selector}`);
    }
  });
  let adminBlock=false, playerGrid=false;
  approved.walkRules(rule=>rule.walkDecls('display',d=>{
    if(rule.selector==='.auction-window.auction-window--approved .auction-lot--admin' && d.value==='block')adminBlock=true;
    if(rule.selector==='.auction-window.auction-window--approved .auction-lot' && d.value==='grid')playerGrid=true;
  }));
  if(!adminBlock) errors.push('Admin lot block-layout override missing');
  if(!playerGrid) errors.push('Player lot grid contract missing');
  const base=postcss.parse(read(auction+'auction-screen.css'));
  base.walkRules(r=>{if(r.selectors.some(s=>/\.auction-lot(?![\w-])/.test(s))) r.walkDecls('display',()=>errors.push('Base lot layout changed for bank/admin'));});
  function classSets(file) {
    const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true);
    const sets=[];
    function visit(n) {
      if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='className'&&n.initializer&&ts.isStringLiteral(n.initializer))sets.push(new Set(n.initializer.text.split(/\s+/)));
      ts.forEachChild(n,visit);
    }
    visit(ast);return sets;
  }
  if(!classSets('src/components/admin/AuctionsAdminPanel.tsx').some(c=>c.has('auction-lot')&&c.has('auction-lot--admin')))errors.push('Admin lot marker missing');
  if(!classSets(auction+'AuctionOverlay.tsx').some(c=>c.has('auction-window')&&c.has('auction-window--approved')))errors.push('Player root marker missing');
  const bank=classSets('src/components/castle-live/bank/BankOverlay.tsx');
  if(!bank.some(c=>c.has('auction-window'))||bank.some(c=>c.has('auction-window--approved')))errors.push('Bank incorrectly uses player auction root');
  return errors;
}
module.exports={checkFiles,checkStyles};
