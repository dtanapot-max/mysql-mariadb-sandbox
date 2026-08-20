'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const CoreEngine=require('../core/core-1.2.0-r8-p1.js');
const {registerVirtualDB}=require('../sandbox/virtual-db.js');

async function setup(){const core=CoreEngine.createCore();const db=registerVirtualDB(core);await core.boot();return{core,db};}

test('Core integration + CRUD + evidence + snapshot + persistence',async()=>{const{core,db}=await setup();
  assert.equal(core.version,'1.2.0-r8-p1');
  await db.query('CREATE DATABASE shop'); await db.query('USE shop');
  await db.query('CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE, age INT DEFAULT 0)');
  let r=await db.query("INSERT INTO users (name,email,age) VALUES ('A','a@test',20)"); assert.equal(r.result.insertId,1);
  await db.query("INSERT INTO users (name,email,age) VALUES ('B','b@test',15)");
  r=await db.query('SELECT id,name FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 10'); assert.deepEqual(r.result.rows,[{id:1,name:'A'}]);
  r=await db.query("UPDATE users SET age=21 WHERE id=1"); assert.equal(r.result.affectedRows,1);
  r=await db.query('DELETE FROM users WHERE age < 18'); assert.equal(r.result.affectedRows,1);
  const snap=db.snapshot('before-change'); await db.query("UPDATE users SET name='Changed' WHERE id=1");
  db.restoreSnapshot(snap);
  assert.equal((await db.query('SELECT name FROM users WHERE id=1')).result.rows[0].name,'A');
  assert.ok(snap && snap.state);
  await db.save(); const before=db.getState(); db.reset(); await db.load(); assert.deepEqual(db.getState(),before);
  assert.ok(db.getEvidence().length>=1); await core.destroy();
});

test('constraint failure rolls back and is evidenced',async()=>{const{core,db}=await setup();await db.query('CREATE DATABASE x');await db.query('USE x');await db.query('CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(50) UNIQUE NOT NULL)');await db.query("INSERT INTO t (email) VALUES ('a')");
  await assert.rejects(()=>db.query("INSERT INTO t (email) VALUES ('a')"),e=>e.code==='ER_DUP_ENTRY'&&e.evidence.status==='FAIL');
  const r=await db.query('SELECT * FROM t');assert.equal(r.result.rowCount,1);await core.destroy();
});

test('unsupported SQL is explicit',async()=>{const{core,db}=await setup();await assert.rejects(()=>db.query('CREATE PROCEDURE p() SELECT 1'),e=>e.code==='NOT_SUPPORTED');await core.destroy();});
