'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core/core-1.2.0-r8-p1.js');
const {createVirtualDB}=require('../sandbox/virtual-db.js');
const {createAISandbox}=require('../sandbox/ai-sandbox-api.js');

test('public AI Control API contract uses the documented production methods', async()=>{
  const core=Core.createCore({storageAdapter:Core.createMemoryStorage()});
  await core.boot();
  const db=createVirtualDB({core});
  const ai=createAISandbox(db);
  const required=[
    'execute','executeBatch','runScenario','inspect','health','capabilities',
    'assertResult','exportReport','transactionStatus','begin','commit','rollback',
    'savepoint','releaseSavepoint','snapshot','restore','reset','save','saveSafe','load'
  ];
  for(const name of required) assert.equal(typeof ai[name],'function',`missing AI API method: ${name}`);
  for(const obsolete of ['batch','scenario','assert','export_report']) assert.equal(ai[obsolete],undefined,`obsolete/undocumented alias leaked: ${obsolete}`);
  await core.destroy();
});
