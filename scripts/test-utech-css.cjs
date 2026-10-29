// Compare worktree CSS against HEAD without APIs, page scripts or production data.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function baseline(file){try{return cp.execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return '';}}
function styles(html,read){return [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(m=>read(m[1])).join('\n');}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();let cases=0;
  await page.route('**/*',r=>r.abort());
  for(const file of ['index.html','u-tech-plus/index.html']){
   const html=fs.readFileSync(path.join(root,file),'utf8');
   const oldHtml=baseline(file),before=styles(oldHtml,baseline),after=styles(html,p=>fs.readFileSync(path.join(root,p),'utf8'));
   const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<base\b[^>]*>/gi,'');
   await page.setContent(clean);await page.addStyleTag({content:before});
   await page.evaluate(()=>{const style=document.createElement('style');style.id='comparisonStyles';style.textContent=document.querySelector('style').textContent;document.querySelector('style').remove();document.head.append(style);});
   const tabs=await page.locator('.tab-panel').evaluateAll(panels=>panels.map(p=>p.id));
   for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    for(const tab of tabs){
     const diffs=await page.evaluate(({before,after,tab})=>{
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===tab));
      document.querySelectorAll('.tab-button').forEach(b=>b.classList.toggle('active',b.getAttribute('aria-controls')===tab));
      document.body.classList.toggle('data-export-active',tab==='tab-export');
      const sheet=document.getElementById('comparisonStyles');
      const elements=[...document.querySelectorAll('body, body *')];
      const capture=()=>elements.map(e=>{const s=getComputedStyle(e);return [...s].map(key=>[key,s.getPropertyValue(key)]);});
      sheet.textContent=before;const old=capture();sheet.textContent=after;const current=capture();const diffs=[];
      for(let i=0;i<elements.length;i++)for(let j=0;j<old[i].length;j++)if(old[i][j][1]!==current[i][j][1]){diffs.push({element:elements[i].id||elements[i].className||elements[i].tagName,property:old[i][j][0],before:old[i][j][1],after:current[i][j][1]});if(diffs.length>=12)return diffs;}
      return diffs;
     },{before,after,tab});
     assert.deepEqual(diffs,[],file+' '+tab+' '+viewport.width+'px');cases++;
    }
   }
  }
  console.log('CSS computed-style equivalence passed: '+cases+' site/tab/viewport cases, including all static elements.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
