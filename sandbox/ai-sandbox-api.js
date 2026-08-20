(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VirtualDBAI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function clone(v){if(typeof structuredClone==='function')try{return structuredClone(v);}catch(_e){}return JSON.parse(JSON.stringify(v));}
function summarizeState(state){
  const databases=Object.values(state?.databases||{}).map(d=>({
    name:d.name,
    tables:Object.values(d.tables||{}).map(t=>({name:t.name,columns:t.columns.map(c=>({name:c.name,type:c.type,length:c.length??null,primary:!!c.primary,unique:!!c.unique,notNull:!!c.notNull,autoIncrement:!!c.autoIncrement,default:c.default})),rowCount:t.rows.length}))
  }));
  return {currentDatabase:state?.currentDatabase||null,databaseCount:databases.length,databases};
}
function createAISandbox(db,options={}){
  if(!db||typeof db.query!=='function')throw new TypeError('AI Sandbox requires VirtualDB instance');
  const maxSteps=Number(options.maxSteps||200);
  async function execute(sql,opts={}){
    try{const out=await db.query({sql,signal:opts.signal});return {ok:true,status:'PASS',sql,result:clone(out.result),evidence:clone(out.evidence)};}
    catch(e){return {ok:false,status:'FAIL',sql,error:{name:e.name||'Error',code:e.code||'VDB_ERROR',message:e.message,phase:e.phase||e.evidence?.execution_phase||null},evidence:clone(e.evidence||null)};}
  }
  async function executeBatch(statements,opts={}){
    if(!Array.isArray(statements))throw new TypeError('executeBatch requires array');
    if(statements.length>maxSteps)throw new RangeError(`Batch exceeds maxSteps=${maxSteps}`);
    const results=[];
    for(const sql of statements){const r=await execute(sql,opts);results.push(r);if(!r.ok&&!opts.continueOnError)break;}
    return {ok:results.every(r=>r.ok),results,summary:{total:results.length,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length}};
  }
  function inspect(){return summarizeState(db.getState());}
  function capabilities(){return clone(typeof db.getCapabilityManifest==='function'?db.getCapabilityManifest():{limits:db.limits,compatibility:db.getCompatibility()});}
  function health(){const ev=db.exportEvidence();return {status:ev.summary.unexpected_failures===0?'PASS':'FAIL',run_id:db.runId,state:inspect(),evidence:ev.summary,limits:clone(db.limits),compatibility:db.getCompatibility(),capabilities:capabilities()};}
  function assertResult(actual,expect={}){
    const issues=[];
    if('ok'in expect&&actual.ok!==expect.ok)issues.push(`ok expected ${expect.ok} got ${actual.ok}`);
    if(expect.errorCode&&actual.error?.code!==expect.errorCode)issues.push(`errorCode expected ${expect.errorCode} got ${actual.error?.code||'none'}`);
    if(expect.rowCount!=null&&actual.result?.rowCount!==expect.rowCount)issues.push(`rowCount expected ${expect.rowCount} got ${actual.result?.rowCount}`);
    if(expect.affectedRows!=null&&actual.result?.affectedRows!==expect.affectedRows)issues.push(`affectedRows expected ${expect.affectedRows} got ${actual.result?.affectedRows}`);
    if(expect.rows!=null&&JSON.stringify(actual.result?.rows)!==JSON.stringify(expect.rows))issues.push('rows mismatch');
    return {pass:issues.length===0,issues};
  }
  async function runScenario(name,steps,opts={}){
    if(!Array.isArray(steps))throw new TypeError('Scenario steps must be array');
    if(steps.length>maxSteps)throw new RangeError(`Scenario exceeds maxSteps=${maxSteps}`);
    const started=Date.now(),results=[];let passed=0,failed=0;
    for(let i=0;i<steps.length;i++){
      const step=steps[i]||{};let actual,assertion={pass:true,issues:[]};
      if(step.sql){actual=await execute(step.sql,opts);if(step.expect)assertion=assertResult(actual,step.expect);}
      else if(step.action==='snapshot'){actual={ok:true,status:'PASS',snapshot:db.snapshot(step.reason||`scenario:${name}:${i+1}`)};}
      else if(step.action==='restore'){const snap=step.snapshot||db.getSnapshots().at(-1);actual={ok:!!snap,status:snap?'PASS':'FAIL',state:snap?db.restoreSnapshot(snap):null};if(!snap)assertion={pass:false,issues:['no snapshot available']};}
      else if(step.action==='reset'){actual={ok:true,status:'PASS',state:db.reset()};}
      else {actual={ok:false,status:'FAIL',error:{code:'AI_STEP_INVALID',message:'Unknown scenario step'}};assertion={pass:false,issues:['invalid step']};}
      const ok=step.expect?assertion.pass:(!!actual.ok&&assertion.pass);if(ok)passed++;else failed++;
      results.push({index:i+1,label:step.label||null,step:clone(step),actual,assertion,status:ok?'PASS':'FAIL'});
      if(!ok&&!opts.continueOnFailure)break;
    }
    return {name,status:failed===0?'PASS':'FAIL',started_at:new Date(started).toISOString(),duration_ms:Date.now()-started,total:results.length,passed,failed,results,final_state:inspect(),evidence_summary:db.exportEvidence().summary};
  }
  function exportReport(){return {generated_at:new Date().toISOString(),health:health(),state:inspect(),evidence:db.exportEvidence()};}
  return {execute,executeBatch,runScenario,inspect,health,capabilities,assertResult,exportReport,transactionStatus:()=>db.getTransactionStatus?clone(db.getTransactionStatus()):null,begin:()=>execute('BEGIN'),commit:()=>execute('COMMIT'),rollback:(savepoint)=>execute(savepoint?`ROLLBACK TO SAVEPOINT ${savepoint}`:'ROLLBACK'),savepoint:(name)=>execute(`SAVEPOINT ${name}`),releaseSavepoint:(name)=>execute(`RELEASE SAVEPOINT ${name}`),snapshot:(r)=>db.snapshot(r||'ai'),restore:(s)=>db.restoreSnapshot(s),reset:()=>db.reset(),save:(k)=>db.save(k),saveSafe:(k)=>db.saveSafe?db.saveSafe(k):db.save(k),load:(k,o)=>db.load(k,o)};
}
return {createAISandbox,summarizeState};
});
