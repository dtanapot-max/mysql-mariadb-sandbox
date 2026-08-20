'use strict';
const fs=require('node:fs');const path=require('node:path');const Core=require('../core/core-1.2.0-r8-p1.js');const {registerVirtualDB}=require('../sandbox/virtual-db.js');
const now=()=>performance.now();
async function bench(name,fn){const start=now();const value=await fn();const ms=now()-start;return{name,ms:+ms.toFixed(3),...value};}
(async()=>{const core=Core.createCore();const db=registerVirtualDB(core,{limits:{maxRowsPerTable:60000,maxResultRows:60000,queryTimeoutMs:30000,maxSqlLength:5_000_000}});await core.boot();await db.query('CREATE DATABASE bench');await db.query('USE bench');await db.query('CREATE TABLE items (id INT AUTO_INCREMENT PRIMARY KEY, grp INT NOT NULL, name VARCHAR(30) UNIQUE)');
const results=[];
for(const n of [100,1000,5000]){db.reset();await db.query('CREATE DATABASE bench');await db.query('USE bench');await db.query('CREATE TABLE items (id INT AUTO_INCREMENT PRIMARY KEY, grp INT NOT NULL, name VARCHAR(30) UNIQUE)');const tuples=[];for(let i=0;i<n;i++)tuples.push(`(${i%100},'n${i}')`);results.push(await bench(`insert_${n}`,async()=>{await db.query(`INSERT INTO items (grp,name) VALUES ${tuples.join(',')}`);return{rows:n,ops_per_sec:0};}));results.at(-1).ops_per_sec=+(n/(results.at(-1).ms/1000)).toFixed(1);results.push(await bench(`select_all_${n}`,async()=>{const r=await db.query('SELECT * FROM items');return{rows:r.result.rowCount};}));results.push(await bench(`where_${n}`,async()=>{const r=await db.query('SELECT id,name FROM items WHERE grp = 42 ORDER BY id');return{rows:r.result.rowCount};}));results.push(await bench(`update_${n}`,async()=>{const r=await db.query('UPDATE items SET grp=43 WHERE grp = 42');return{rows:r.result.affectedRows};}));}
// Join benchmark
await db.query('CREATE TABLE groups (id INT PRIMARY KEY, label VARCHAR(20))');const gt=[];for(let i=0;i<100;i++)gt.push(`(${i},'g${i}')`);await db.query(`INSERT INTO groups (id,label) VALUES ${gt.join(',')}`);results.push(await bench('inner_join_5000x100',async()=>{const r=await db.query('SELECT items.id,groups.label FROM items INNER JOIN groups ON items.grp = groups.id LIMIT 5000');return{rows:r.result.rowCount};}));
results.push(await bench('indexed_point_lookup_1000x5000',async()=>{let rows=0;for(let i=0;i<1000;i++){const r=await db.query(`SELECT id FROM items WHERE id = ${(i%5000)+1} LIMIT 1`);rows+=r.result.rowCount;}return{queries:1000,rows};}));
results.push(await bench('table_scan_lookup_100x5000',async()=>{let rows=0;for(let i=0;i<100;i++){const r=await db.query(`SELECT id FROM items WHERE grp = ${i%100} LIMIT 1`);rows+=r.result.rowCount;}return{queries:100,rows};}));
// Transaction journal benchmarks (production engine)
for(const n of [10,1000,5000]){
  results.push(await bench(`transaction_insert_rollback_${n}`,async()=>{
    const baseCount=(await db.query('SELECT id FROM items')).result.rowCount;
    await db.query('BEGIN');
    const tuples=[];for(let i=0;i<n;i++)tuples.push(`(${900000+i},'tx${n}_${i}')`);
    await db.query(`INSERT INTO items (grp,name) VALUES ${tuples.join(',')}`);
    const journalEntries=db.getTransactionStatus().journalLength;
    await db.query('ROLLBACK');
    const afterCount=(await db.query('SELECT id FROM items')).result.rowCount;
    if(afterCount!==baseCount)throw new Error(`transaction rollback mismatch ${afterCount} != ${baseCount}`);
    return{rows:n,journal_entries:journalEntries,restored:true};
  }));
}
// Snapshot / JSON export
results.push(await bench('snapshot_5000',async()=>{const s=db.snapshot('bench');return{bytes:Buffer.byteLength(JSON.stringify(s.state))};}));
const byName=Object.fromEntries(results.map(r=>[r.name,r]));const report={timestamp:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,results,matrix:{indexed_vs_scan:{best_case:byName.indexed_point_lookup_1000x5000,worst_case:byName.table_scan_lookup_100x5000},transaction_rollback:[10,1000,5000].map(n=>byName[`transaction_insert_rollback_${n}`])}};fs.mkdirSync(path.join(__dirname,'../evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../evidence/benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await core.destroy();})().catch(e=>{console.error(e);process.exit(1)});
