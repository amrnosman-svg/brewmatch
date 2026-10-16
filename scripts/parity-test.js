// Drift check: run the real quiz (index.html in jsdom) vs netlify/functions/lib/engine.js on N random profiles.
// Setup once: npm i --no-save jsdom@24     Run: node scripts/parity-test.js 1000
// Rerun after ANY scoring change: node scripts/build-engine.js && node scripts/parity-test.js 1000
// Parity test: real quiz page (index.html run in jsdom) vs generated API engine, N random profiles.
const fs=require('fs'), path=require('path'); const {JSDOM}=require('jsdom');
const REPO=path.join(__dirname,'..');
let html=fs.readFileSync(path.join(REPO,'index.html'),'utf8');
const marker='const display = scoredFiltered.length > 0';
if(html.split(marker).length!==2) throw new Error('marker count');
html=html.replace(marker,'window.__scored = scoredFiltered.map(x=>({n:x.m.name,s:x.result.score,r:x.result.reasons,x:x.result.misses}));\n    '+marker); // test-only, in-memory
const records=require(path.join(REPO,'data/machines.raw.json'));
const engine=require(path.join(REPO,'netlify/functions/lib/engine.js'));
const machinesApi=records.filter(r=>r.fields.active===true).map(engine.mapAirtableRecord); engine.applyExtras(machinesApi);
const N=+process.argv[2]||500;
(async()=>{
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://getbrewharbor.com/',beforeParse(w){
   w.fetch=async()=>({ok:true,status:200,json:async()=>records,text:async()=>''});
   w.scrollTo=()=>{};w.alert=()=>{};w.gtag=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
   w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){}}));
 }});
 const w=dom.window; await new Promise(r=>setTimeout(r,1500));
 const nPage=w.eval('machines.length'); console.log('page machines',nPage,'api machines',machinesApi.length);
 const pick=a=>a[Math.floor(Math.random()*a.length)];
 const subset=(a,min,max)=>{const k=min+Math.floor(Math.random()*(max-min+1));return [...a].sort(()=>Math.random()-.5).slice(0,k)};
 let ok=0,bad=0,empty=0,errs=0;const fails=[];
 for(let i=0;i<N;i++){
  const ua={drinks:subset(['espresso','latte','drip','cold','pod','specialty'],1,4),effort:pick(['none','minimal','moderate','hands-on']),coffeeType:pick(['any','beans','pods','ground']),maintenance:pick(['none','light','moderate','high']),tempImportance:pick(['not','somewhat','very']),cups:1+Math.floor(Math.random()*8),budget:pick([80,150,250,400,600,800,1000,1500,2500,4000]),region:pick(['us','ca','uk','eu','au']),priorities:subset(['quality','speed','cost','eco','variety','compact'],0,3)};
  w.__ua=JSON.parse(JSON.stringify(ua)); w.__scored=null;
  try{ w.eval('userAnswers = Object.assign({}, window.__ua)'); w.eval('showResults()'); }catch(e){ errs++; }
  const page=w.__scored; engine.setAnswers(JSON.parse(JSON.stringify(ua))); const api=engine.rank(machinesApi).map(x=>({n:x.m.name,s:x.result.score,r:x.result.reasons,x:x.result.misses}));
  if(page==null){ if(api.length===0) empty++; else {bad++; fails.push({ua,why:'page null'});} continue; }
  const same=JSON.stringify(page)===JSON.stringify(api);
  if(same) ok++; else {bad++; if(fails.length<3){const pm=Object.fromEntries(page.map(x=>[x.n,x])),am=Object.fromEntries(api.map(x=>[x.n,x]));const diff=[];for(const k of new Set([...Object.keys(pm),...Object.keys(am)])){if(!pm[k]||!am[k]||pm[k].s!==am[k].s)diff.push(k+' page='+(pm[k]&&pm[k].s)+' api='+(am[k]&&am[k].s));}console.log('DIFF',JSON.stringify(ua),diff.slice(0,4).join(' | '));}
  if(fails.length<3) fails.push({ua,page:page.slice(0,3).map(x=>x.n+':'+x.s),api:api.slice(0,3).map(x=>x.n+':'+x.s)});}
 }
 console.log(JSON.stringify({N,identical:ok,mismatch:bad,pageNoResultsAndApiEmpty:empty,evalErrors:errs}));
 if(fails.length) console.log(JSON.stringify(fails,null,1));
 process.exit(bad?1:0);
})();
