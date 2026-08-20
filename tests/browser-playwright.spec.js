'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const evidenceDir=path.join(__dirname,'../evidence');
const statusPath=path.join(evidenceDir,'browser-test-status.json');
function updateCompatibility(status,note){
  const compatStatus=status==='PASS'?'PASS':status==='FAIL'?'PARTIAL':'NOT_TESTED';
  for(const file of ['sandbox-compatibility.json','capability-manifest.json']){
    const p=path.join(evidenceDir,file);if(!fs.existsSync(p))continue;
    const data=JSON.parse(fs.readFileSync(p,'utf8'));
    if(file==='sandbox-compatibility.json')data.INDEXEDDB_PERSISTENCE={status:compatStatus,note};
    else{if(data.capabilities)data.capabilities.INDEXEDDB_PERSISTENCE={status:compatStatus,note};if(data.persistence)data.persistence.indexeddb=compatStatus;}
    fs.writeFileSync(p,JSON.stringify(data,null,2));
  }
}
test('IndexedDB survives a real page reload and Core recreation',async({page,browserName})=>{
  const started=new Date().toISOString();
  try{
    await page.goto('/tests/browser-smoke.html',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#out')).toHaveText('BROWSER_INDEXEDDB_RELOAD_PASS',{timeout:20000});
    const note='Playwright real-browser IndexedDB save/reload/load verified across page reload';
    fs.writeFileSync(statusPath,JSON.stringify({schema:'core12.virtualdb.browser-status.v1',timestamp:new Date().toISOString(),started_at:started,status:'PASS',browser:`playwright-${browserName}`,reason:null,marker:'BROWSER_INDEXEDDB_RELOAD_PASS'},null,2));
    updateCompatibility('PASS',note);
  }catch(error){
    const note=`Playwright real-browser verification failed: ${error.message}`;
    fs.writeFileSync(statusPath,JSON.stringify({schema:'core12.virtualdb.browser-status.v1',timestamp:new Date().toISOString(),started_at:started,status:'FAIL',browser:`playwright-${browserName}`,reason:'INDEXEDDB_RELOAD_VERIFICATION_FAILED',message:error.message},null,2));
    updateCompatibility('FAIL',note);
    throw error;
  }
});
