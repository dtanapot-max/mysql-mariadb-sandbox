'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core/core-1.2.0-r8-p1.js');
const VDB=require('../sandbox/virtual-db.js');
async function setup(){const core=Core.createCore();const db=VDB.registerVirtualDB(core);await core.boot();return{core,db};}
async function schema(db){await db.query('CREATE DATABASE tx');await db.query('USE tx');await db.query('CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(100) UNIQUE, score INT DEFAULT 0)');}

test('production engine supports BEGIN/ROLLBACK using transaction journal',async()=>{const{core,db}=await setup();await schema(db);await db.query('BEGIN');await db.query("INSERT INTO users (id,email,score) VALUES (1,'a@x',10)");assert.equal(db.getTransactionStatus().journalLength,1);await db.query('ROLLBACK');assert.deepEqual((await db.query('SELECT * FROM users')).result.rows,[]);assert.equal(db.getTransactionStatus().active,false);await core.destroy();});

test('COMMIT preserves transaction changes',async()=>{const{core,db}=await setup();await schema(db);await db.query('START TRANSACTION');await db.query("INSERT INTO users (id,email) VALUES (1,'a@x')");await db.query('COMMIT');assert.equal((await db.query('SELECT * FROM users')).result.rowCount,1);assert.equal(db.getTransactionStatus().journalLength,0);await core.destroy();});

test('SAVEPOINT rolls back only changes after savepoint',async()=>{const{core,db}=await setup();await schema(db);await db.query('BEGIN');await db.query("INSERT INTO users (id,email) VALUES (1,'a@x')");await db.query('SAVEPOINT before_second');await db.query("INSERT INTO users (id,email) VALUES (2,'b@x')");await db.query('ROLLBACK TO SAVEPOINT before_second');assert.deepEqual((await db.query('SELECT id FROM users ORDER BY id')).result.rows,[{id:1}]);await db.query('COMMIT');await core.destroy();});

test('transaction rollback restores UPDATE and DELETE plus unique indexes',async()=>{const{core,db}=await setup();await schema(db);await db.query("INSERT INTO users (id,email,score) VALUES (1,'a@x',10),(2,'b@x',20)");await db.query('BEGIN');await db.query("UPDATE users SET email='c@x', score=99 WHERE id=1");await db.query('DELETE FROM users WHERE id=2');await db.query('ROLLBACK');assert.deepEqual((await db.query('SELECT id,email,score FROM users ORDER BY id')).result.rows,[{id:1,email:'a@x',score:10},{id:2,email:'b@x',score:20}]);await assert.rejects(()=>db.query("INSERT INTO users (id,email) VALUES (3,'a@x')"),e=>e.code==='ER_DUP_ENTRY');await core.destroy();});

test('transaction rollback handles create/drop database and table',async()=>{const{core,db}=await setup();await db.query('CREATE DATABASE keep');await db.query('USE keep');await db.query('CREATE TABLE t (id INT PRIMARY KEY)');await db.query('BEGIN');await db.query('DROP TABLE t');await db.query('CREATE TABLE temp (id INT PRIMARY KEY)');await db.query('ROLLBACK');const s=db.getState();assert.ok(s.databases.keep.tables.t);assert.equal(s.databases.keep.tables.temp,undefined);await db.query('BEGIN');await db.query('DROP DATABASE keep');await db.query('ROLLBACK');assert.ok(db.getState().databases.keep);assert.equal(db.getState().currentDatabase,'keep');await core.destroy();});

test('unsafe and malformed identifiers are rejected by production engine',async()=>{const{core,db}=await setup();for(const name of ['__proto__','constructor','prototype','bad-name']){await assert.rejects(()=>db.query(`CREATE DATABASE ${name}`),e=>e.code==='ER_INVALID_IDENTIFIER'||e.code==='NOT_SUPPORTED'||e.code==='ER_PARSE_ERROR');}await db.query('CREATE DATABASE safe_db');await db.query('USE safe_db');await assert.rejects(()=>db.query('CREATE TABLE constructor (id INT PRIMARY KEY)'),e=>e.code==='ER_INVALID_IDENTIFIER');await core.destroy();});

test('capability manifest declares verified transaction/savepoint support',async()=>{const{core,db}=await setup();const c=db.getCapabilityManifest().capabilities;assert.equal(c.TRANSACTION.status,'PASS');assert.equal(c.SAVEPOINT.status,'PASS');await core.destroy();});
