const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{let browser;try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.route('**/*',route=>route.abort());
  for(const file of ['index.html','yui-tech/index.html']){
    const html=fs.readFileSync(path.resolve(__dirname,'../',file),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    await page.setContent(html,{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../chart-axis-enter.js'),'utf8')});
    const coverage=await page.evaluate(()=>{
      const buttons=Array.from(document.querySelectorAll('button')).filter(button=>button.textContent.trim()==='縦軸反映');let inputs=0;
      for(const button of buttons){const controls=button.closest('.chart-axis-control');if(!controls)throw new Error('軸設定の親要素なし');
        let clicked=0;button.onclick=()=>{clicked++;};
        for(const input of controls.querySelectorAll('input[type=number]')){
          const before=clicked,event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(event);
          if(clicked!==before+1||!event.defaultPrevented)throw new Error(input.id+' のEnter反映に失敗');inputs++;
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));if(clicked!==before+1)throw new Error('IME確定で反映した');
        }
      }
      const input=document.querySelector('.chart-axis-control input[type=number]'),button=Array.from(input.closest('.chart-axis-control').querySelectorAll('button')).find(b=>b.textContent.trim()==='縦軸反映');let called=0;button.onclick=()=>called++;button.disabled=true;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));if(called)throw new Error('無効なボタンを呼んだ');
      return {buttons:buttons.length,inputs};
    });assert.ok(coverage.buttons>0&&coverage.inputs>=coverage.buttons);console.log(file+': '+coverage.buttons+' axis buttons, '+coverage.inputs+' numeric inputs passed.');
  }
}finally{if(browser)await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
