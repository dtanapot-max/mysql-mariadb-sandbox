'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.VirtualDB=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

const DEFAULT_LIMITS=Object.freeze({
  maxSqlLength:100000,
  maxDatabases:32,
  maxTablesPerDatabase:128,
  maxColumnsPerTable:128,
  maxRowsPerTable:100000,
  maxResultRows:10000,
  maxSnapshots:100,
  maxExpressionDepth:64,
  queryTimeoutMs:3000,
  maxImportBytes:5*1024*1024,
  maxEvidenceEvents:10000
});

function createVirtualDB(options={}){
  const core=options.core;
  if(!core) throw new TypeError('VirtualDB requires core');
  const limits=Object.freeze({...DEFAULT_LIMITS,...(options.limits||{})});
  const baseline=()=>({databases:{},currentDatabase:null});
  let state=baseline();
  let seq=0;
  const runId=options.runId||`vdb-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const events=[];
  const evidenceTotals={operations:0,passed:0,failed:0,expected_failures:0,unexpected_failures:0,unsupported:0,warnings:0,dropped_events:0};
  const snapshots=[];
  const compatibility=new Map();
  const clone=(v)=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const perfNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  const RESERVED_IDENTIFIERS=new Set(['__proto__','constructor','prototype']);
  const ident=(value)=>{
    const raw=String(value).trim().replace(/^`|`$/g,'');
    const parts=raw.split('.');
    for(const part of parts){
      if(RESERVED_IDENTIFIERS.has(part.toLowerCase())) fail('ER_INVALID_IDENTIFIER',`Unsafe identifier '${part}' rejected`,'validate',{identifier:part});
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) fail('ER_INVALID_IDENTIFIER',`Invalid identifier '${part}'`,'validate',{identifier:part});
    }
    return raw;
  };
  const feature=(name,status='PASS',note=null)=>compatibility.set(name,{status,note});
  for(const f of ['CREATE_DATABASE','DROP_DATABASE','USE','CREATE_TABLE','DROP_TABLE','INSERT','SELECT','UPDATE','DELETE','WHERE','ORDER_BY','LIMIT','OFFSET','PRIMARY_KEY','UNIQUE','NOT_NULL','DEFAULT','AUTO_INCREMENT','INNER_JOIN','LEFT_JOIN','ALTER_ADD_COLUMN','ALTER_DROP_COLUMN','ALTER_MODIFY_COLUMN','MEMORY_PERSISTENCE','SNAPSHOT_RESTORE','EVIDENCE_EXPORT','TRANSACTION','SAVEPOINT']) feature(f,'PASS');
  feature('INDEXEDDB_PERSISTENCE','NOT_TESTED','Requires a real browser IndexedDB verification run');
  for(const f of ['FOREIGN_KEY','GROUP_BY','HAVING','SUBQUERY','VIEW','PROCEDURE','TRIGGER']) feature(f,'NOT_SUPPORTED');

  function fail(code,message,phase='execute',extra={}){const e=new Error(message);Object.assign(e,{code,phase,...extra});throw e;}
  function checkAbort(start,signal){
    if(signal?.aborted) fail('ABORTED','Query aborted','execute');
    if(perfNow()-start>limits.queryTimeoutMs) fail('QUERY_TIMEOUT',`Query exceeded ${limits.queryTimeoutMs}ms`,'execute');
  }
  function splitCSV(s){
    const out=[]; let cur='',q=null,depth=0;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(q){cur+=c;if(c===q&&s[i-1]!=="\\")q=null;continue;}
      if(c==="'"||c==='"'||c==='`'){q=c;cur+=c;continue;}
      if(c==='(')depth++; else if(c===')')depth--;
      if(c===','&&depth===0){out.push(cur.trim());cur='';}else cur+=c;
    }
    if(q||depth!==0) fail('ER_PARSE_ERROR','Unbalanced quote or parenthesis','parse');
    if(cur.trim())out.push(cur.trim());
    return out;
  }
  function literal(s){
    s=String(s).trim();
    if(/^null$/i.test(s))return null;
    if(/^true$/i.test(s))return 1;
    if(/^false$/i.test(s))return 0;
    if(/^[-+]?\d+(?:\.\d+)?$/.test(s))return Number(s);
    if((s[0]==="'"&&s.at(-1)==="'")||(s[0]==='"'&&s.at(-1)==='"')) return s.slice(1,-1).replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    return {identifier:ident(s)};
  }
  function db(name=state.currentDatabase){
    if(!name) fail('ER_NO_DB_ERROR','No database selected');
    const d=state.databases[name];
    if(!d) fail('ER_BAD_DB_ERROR',`Unknown database '${name}'`);
    return d;
  }
  function table(name,database=state.currentDatabase){const t=db(database).tables[ident(name)];if(!t)fail('ER_NO_SUCH_TABLE',`Table '${name}' doesn't exist`);return t;}
  function column(t,name){const n=ident(name).split('.').pop();const c=t.columns.find(x=>x.name===n);if(!c)fail('ER_BAD_FIELD_ERROR',`Unknown column '${n}'`,'validate',{column:n});return c;}
  function parseDefault(tail){const m=tail.match(/\bDEFAULT\s+((?:'[^']*(?:\\'[^']*)*')|(?:"[^"]*(?:\\"[^"]*)*")|[^\s,]+)/i);return m?literal(m[1]):undefined;}
  function parseColumnDef(def){
    const cm=def.match(/^`?([A-Za-z_]\w*)`?\s+([A-Z]+)(?:\(([^)]+)\))?(.*)$/i);
    if(!cm) fail('ER_PARSE_ERROR',`Unsupported column definition: ${def}`,'parse');
    const tail=cm[4]||'';
    const type=cm[2].toUpperCase();
    const supported=new Set(['INT','INTEGER','BIGINT','TINYINT','VARCHAR','TEXT','DECIMAL','BOOLEAN','BOOL','DATE','DATETIME']);
    if(!supported.has(type)) fail('NOT_SUPPORTED',`Data type ${type} is outside the verified subset`,'parse',{unsupportedFeature:`TYPE_${type}`});
    const c={name:cm[1],type:type==='INTEGER'?'INT':type==='BOOL'?'BOOLEAN':type,length:cm[3]||null,primary:/\bPRIMARY\s+KEY\b/i.test(tail),unique:/\bUNIQUE\b/i.test(tail),notNull:/\bNOT\s+NULL\b/i.test(tail),autoIncrement:/\bAUTO_INCREMENT\b/i.test(tail),default:parseDefault(tail)};
    if(c.primary){c.unique=true;c.notNull=true;}
    if(c.autoIncrement&&!['INT','BIGINT'].includes(c.type)) fail('ER_WRONG_AUTO_KEY','AUTO_INCREMENT requires integer type','validate',{column:c.name});
    return c;
  }
  function coerce(c,v){
    if(v===null||v===undefined) return v;
    switch(c.type){
      case 'INT':case 'BIGINT':case 'TINYINT':{
        if(typeof v==='number'&&Number.isInteger(v))return v;
        if(typeof v==='string'&&/^-?\d+$/.test(v))return Number(v);
        fail('ER_TRUNCATED_WRONG_VALUE',`Incorrect integer value for column '${c.name}'`,'constraint',{column:c.name,value:v});
      }
      case 'DECIMAL':{
        if(typeof v==='number'&&Number.isFinite(v))return v;
        if(typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v))return Number(v);
        fail('ER_TRUNCATED_WRONG_VALUE',`Incorrect decimal value for column '${c.name}'`,'constraint',{column:c.name,value:v});
      }
      case 'BOOLEAN': return v===true||v===1||v==='1'?1:v===false||v===0||v==='0'?0:fail('ER_TRUNCATED_WRONG_VALUE',`Incorrect boolean value for column '${c.name}'`,'constraint',{column:c.name,value:v});
      case 'VARCHAR':{
        const s=String(v);const max=Number(String(c.length||'').split(',')[0]);
        if(max&&s.length>max) fail('ER_DATA_TOO_LONG',`Data too long for column '${c.name}'`,'constraint',{column:c.name,maxLength:max});
        return s;
      }
      case 'TEXT': return String(v);
      case 'DATE': if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v); else fail('ER_TRUNCATED_WRONG_VALUE',`Incorrect DATE value for column '${c.name}'`,'constraint',{column:c.name});
      case 'DATETIME': if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(String(v)))return String(v).replace('T',' '); else fail('ER_TRUNCATED_WRONG_VALUE',`Incorrect DATETIME value for column '${c.name}'`,'constraint',{column:c.name});
      default:return v;
    }
  }
  function indexKey(v){return `${typeof v}:${String(v)}`;}
  function rebuildUniqueIndexes(t){
    const indexes={};
    for(const c of t.columns.filter(x=>x.primary||x.unique)){
      const idx=Object.create(null);
      for(let i=0;i<t.rows.length;i++){const v=t.rows[i][c.name];if(v!=null)idx[indexKey(v)]=i;}
      indexes[c.name]=idx;
    }
    Object.defineProperty(t,'uniqueIndexes',{value:indexes,writable:true,configurable:true,enumerable:false});
    return indexes;
  }
  function ensureUniqueIndexes(t){
    const needed=t.columns.filter(x=>x.primary||x.unique).map(x=>x.name);
    if(!t.uniqueIndexes||needed.some(n=>!t.uniqueIndexes[n])) rebuildUniqueIndexes(t);
    return t.uniqueIndexes;
  }
  function addUniqueIndexRow(t,row,rowIndex){
    const indexes=ensureUniqueIndexes(t);
    for(const c of t.columns.filter(x=>x.primary||x.unique)){const v=row[c.name];if(v!=null)indexes[c.name][indexKey(v)]=rowIndex;}
  }
  function replaceUniqueIndexRow(t,oldRow,newRow,rowIndex){
    const indexes=ensureUniqueIndexes(t);
    for(const c of t.columns.filter(x=>x.primary||x.unique)){
      const ov=oldRow?.[c.name],nv=newRow?.[c.name];
      if(ov!=null&&indexes[c.name][indexKey(ov)]===rowIndex)delete indexes[c.name][indexKey(ov)];
      if(nv!=null)indexes[c.name][indexKey(nv)]=rowIndex;
    }
  }
  function validateRow(t,row,exclude=null){
    for(const c of t.columns){
      if((row[c.name]===null||row[c.name]===undefined)&&c.notNull) fail('ER_BAD_NULL_ERROR',`Column '${c.name}' cannot be null`,'constraint',{column:c.name});
      if(row[c.name]!==null&&row[c.name]!==undefined) row[c.name]=coerce(c,row[c.name]);
    }
    const indexes=ensureUniqueIndexes(t);
    for(const c of t.columns.filter(x=>x.primary||x.unique)){
      const v=row[c.name]; if(v==null&&c.primary) fail('ER_BAD_NULL_ERROR',`Column '${c.name}' cannot be null`,'constraint',{column:c.name}); if(v==null)continue;
      const hit=indexes[c.name][indexKey(v)];
      if(hit!==undefined&&hit!==exclude) fail('ER_DUP_ENTRY',`Duplicate entry '${v}' for key '${c.name}'`,'constraint',{column:c.name});
    }
  }

  function tokenizeExpr(text){
    const tokens=[];let i=0;
    while(i<text.length){
      if(/\s/.test(text[i])){i++;continue;}
      const c=text[i];
      if(c==='('||c===')'){tokens.push({type:c,value:c});i++;continue;}
      const op=text.slice(i).match(/^(>=|<=|<>|!=|=|>|<)/);if(op){tokens.push({type:'OP',value:op[1]});i+=op[1].length;continue;}
      if(c==="'"||c==='"'){let q=c,j=i+1,s=c;for(;j<text.length;j++){s+=text[j];if(text[j]===q&&text[j-1]!=="\\"){j++;break;}}if(s.at(-1)!==q)fail('ER_PARSE_ERROR','Unterminated string in WHERE','parse');tokens.push({type:'VALUE',value:literal(s)});i=j;continue;}
      const m=text.slice(i).match(/^([A-Za-z_][\w.`]*|-?\d+(?:\.\d+)?|NULL|TRUE|FALSE)/i);if(!m)fail('ER_PARSE_ERROR',`Unexpected token near '${text.slice(i,20)}'`,'parse');
      const raw=m[1]; if(/^AND$/i.test(raw)||/^OR$/i.test(raw))tokens.push({type:raw.toUpperCase(),value:raw.toUpperCase()}); else if(/^NULL|TRUE|FALSE$/i.test(raw)||/^-?\d/.test(raw))tokens.push({type:'VALUE',value:literal(raw)}); else tokens.push({type:'IDENT',value:ident(raw)});i+=raw.length;
    }return tokens;
  }
  function parseWhere(text,availableColumns){
    if(!text)return ()=>true;
    const tokens=tokenizeExpr(text);let pos=0,depth=0;
    const colSet=new Set(availableColumns||[]);
    const resolve=(row,x)=>{if(x&&x.kind==='ident'){const key=x.value;const short=key.split('.').pop();if(!colSet.has(key)&&!colSet.has(short))fail('ER_BAD_FIELD_ERROR',`Unknown column '${key}' in 'where clause'`,'validate',{column:key});return row[key]!==undefined?row[key]:row[short];}return x?.value;};
    function primary(){if(++depth>limits.maxExpressionDepth)fail('EXPRESSION_DEPTH_LIMIT','Expression nesting limit exceeded','parse');try{if(tokens[pos]?.type==='('){pos++;const n=or();if(tokens[pos]?.type!==')')fail('ER_PARSE_ERROR','Missing ) in WHERE','parse');pos++;return n;}const l=tokens[pos++];if(!l||!['IDENT','VALUE'].includes(l.type))fail('ER_PARSE_ERROR','Expected operand in WHERE','parse');const op=tokens[pos++];if(!op||op.type!=='OP')fail('ER_PARSE_ERROR','Expected comparison operator in WHERE','parse');const r=tokens[pos++];if(!r||!['IDENT','VALUE'].includes(r.type))fail('ER_PARSE_ERROR','Expected right operand in WHERE','parse');return{kind:'cmp',op:op.value,left:{kind:l.type==='IDENT'?'ident':'value',value:l.value},right:{kind:r.type==='IDENT'?'ident':'value',value:r.value}};}finally{depth--;}}
    function and(){let n=primary();while(tokens[pos]?.type==='AND'){pos++;n={kind:'and',left:n,right:primary()};}return n;}
    function or(){let n=and();while(tokens[pos]?.type==='OR'){pos++;n={kind:'or',left:n,right:and()};}return n;}
    const ast=or();if(pos!==tokens.length)fail('ER_PARSE_ERROR','Unexpected trailing WHERE tokens','parse');
    const evalNode=(n,row)=>{if(n.kind==='and')return evalNode(n.left,row)&&evalNode(n.right,row);if(n.kind==='or')return evalNode(n.left,row)||evalNode(n.right,row);const a=resolve(row,n.left),b=resolve(row,n.right);if(a==null||b==null)return false;switch(n.op){case'=':return a===b;case'!=':case'<>':return a!==b;case'>':return a>b;case'<':return a<b;case'>=':return a>=b;case'<=':return a<=b;default:return false;}};
    const predicate=row=>evalNode(ast,row);predicate.ast=ast;
    if(ast.kind==='cmp'&&ast.op==='='){
      if(ast.left.kind==='ident'&&ast.right.kind==='value')predicate.simpleEquality={column:ast.left.value,value:ast.right.value};
      else if(ast.right.kind==='ident'&&ast.left.kind==='value')predicate.simpleEquality={column:ast.right.value,value:ast.left.value};
    }
    return predicate;
  }
  function availableColsForTable(t,alias=t.name){const a=[];for(const c of t.columns){a.push(c.name,`${alias}.${c.name}`,`${t.name}.${c.name}`);}return [...new Set(a)];}
  function projectRows(rows,fields,available){
    if(fields.trim()==='*') return rows.map(clone);
    const specs=splitCSV(fields).map(x=>{const m=x.match(/^(.+?)(?:\s+AS\s+`?(\w+)`?)?$/i);return{source:ident(m[1]),out:m[2]||ident(m[1]).split('.').pop()};});
    for(const s of specs){if(!available.includes(s.source)&&!available.includes(s.source.split('.').pop()))fail('ER_BAD_FIELD_ERROR',`Unknown column '${s.source}' in 'field list'`,'validate',{column:s.source});}
    return rows.map(r=>Object.fromEntries(specs.map(s=>[s.out,r[s.source]!==undefined?r[s.source]:r[s.source.split('.').pop()]])));
  }
  function prefixedRow(row,tname,alias=tname){const out={...row};for(const[k,v]of Object.entries(row)){out[`${tname}.${k}`]=v;out[`${alias}.${k}`]=v;}return out;}

  function classifyError(error){return error.expected===true||['NOT_SUPPORTED','ER_DUP_ENTRY','ER_BAD_NULL_ERROR','ER_BAD_FIELD_ERROR','ER_NO_SUCH_TABLE','ER_BAD_DB_ERROR','ER_NO_DB_ERROR','ER_PARSE_ERROR','ER_TRUNCATED_WRONG_VALUE','ER_DATA_TOO_LONG','ER_DB_CREATE_EXISTS','ER_DB_DROP_EXISTS','ER_TABLE_EXISTS_ERROR','ER_DUP_FIELDNAME','ER_WRONG_VALUE_COUNT','ER_CANT_DROP_FIELD_OR_KEY','ER_WRONG_AUTO_KEY','EXPRESSION_DEPTH_LIMIT','RESOURCE_LIMIT','QUERY_TIMEOUT','ABORTED','ER_INVALID_IDENTIFIER','ER_TX_ACTIVE','ER_NO_ACTIVE_TX','ER_SP_DOES_NOT_EXIST'].includes(error.code)?'EXPECTED_FAILURE':'UNEXPECTED_FAILURE';}
  function evidence(sql,operation,start,status,result,error,before,meta={}){
    const classif=error?classifyError(error):'PASS';
    const item={run_id:runId,sequence:++seq,timestamp:new Date().toISOString(),operation,original_sql:sql,parser_status:error?.phase==='parse'?'FAIL':'PASS',ast_summary:meta.astSummary||{statement:operation},execution_plan:meta.plan||null,database:state.currentDatabase,table:meta.table||null,execution_phase:error?.phase||'complete',duration_ms:Number((perfNow()-start).toFixed(3)),status,failure_classification:classif,rows_returned:result?.rowCount??result?.rows?.length??0,affected_rows:result?.affectedRows??0,insert_id:result?.insertId??null,state_changed:before===state?false:JSON.stringify(before)!==JSON.stringify(state),snapshot_before:meta.snapshotBefore??null,snapshot_after:meta.snapshotAfter??null,warnings:meta.warnings||[],errors:error?[{code:error.code||'VDB_ERROR',message:error.message,phase:error.phase||'execute'}]:[],compatibility_status:error?.code==='NOT_SUPPORTED'?'NOT_SUPPORTED':(error&&classif==='UNEXPECTED_FAILURE'?'PARTIAL':'PASS'),unsupported_features:error?.unsupportedFeature?[error.unsupportedFeature]:[]};
    evidenceTotals.operations++; if(status==='PASS')evidenceTotals.passed++; else evidenceTotals.failed++; if(classif==='EXPECTED_FAILURE')evidenceTotals.expected_failures++; if(classif==='UNEXPECTED_FAILURE')evidenceTotals.unexpected_failures++; if(item.compatibility_status==='NOT_SUPPORTED')evidenceTotals.unsupported++; evidenceTotals.warnings+=item.warnings.length;
    events.push(item); if(events.length>limits.maxEvidenceEvents){events.shift();evidenceTotals.dropped_events++;} core.events?.emit('virtualdb:operation',item);return item;
  }
  function ensureSql(sql){if(typeof sql!=='string'||!sql.trim())throw new TypeError('SQL must be non-empty string');if(sql.length>limits.maxSqlLength)fail('RESOURCE_LIMIT',`SQL exceeds maxSqlLength=${limits.maxSqlLength}`,'validate',{limit:'maxSqlLength'});return sql.trim().replace(/;\s*$/,'');}

  async function executeStatement(input,params={}){
    let sql=typeof input==='string'?input:input?.sql; const signal=typeof input==='object'?input.signal:params.signal;
    sql=ensureSql(sql);const start=perfNow(),readOnly=/^SELECT\b/i.test(sql),before=readOnly?state:clone(state),snapBefore=snapshots.length?snapshots.at(-1).id:null;let op='UNKNOWN',meta={snapshotBefore:snapBefore};
    try{let m;checkAbort(start,signal);
      if(m=sql.match(/^CREATE\s+DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?`?([\w-]+)`?$/i)){op='CREATE_DATABASE';const ifne=!!m[1],n=ident(m[2]);if(state.databases[n]){if(ifne){const result={affectedRows:0,warningCount:1};meta.warnings=['DATABASE_EXISTS'];return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}fail('ER_DB_CREATE_EXISTS',`Can't create database '${n}'; database exists`);}if(Object.keys(state.databases).length>=limits.maxDatabases)fail('RESOURCE_LIMIT','Maximum databases reached','validate',{limit:'maxDatabases'});state.databases[n]={name:n,tables:{}};const result={affectedRows:1};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?`?([\w-]+)`?$/i)){op='DROP_DATABASE';const ife=!!m[1],n=ident(m[2]);if(!state.databases[n]){if(ife){const result={affectedRows:0,warningCount:1};meta.warnings=['DATABASE_NOT_FOUND'];return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}fail('ER_DB_DROP_EXISTS',`Can't drop database '${n}'; database doesn't exist`);}delete state.databases[n];if(state.currentDatabase===n)state.currentDatabase=null;const result={affectedRows:1};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^USE\s+`?([\w-]+)`?$/i)){op='USE';const n=ident(m[1]);if(!state.databases[n])fail('ER_BAD_DB_ERROR',`Unknown database '${n}'`);state.currentDatabase=n;const result={database:n};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]+)\)$/i)){op='CREATE_TABLE';const ifne=!!m[1],name=ident(m[2]),d=db();meta.table=name;if(d.tables[name]){if(ifne){const result={affectedRows:0,warningCount:1};meta.warnings=['TABLE_EXISTS'];return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}fail('ER_TABLE_EXISTS_ERROR',`Table '${name}' already exists`);}if(Object.keys(d.tables).length>=limits.maxTablesPerDatabase)fail('RESOURCE_LIMIT','Maximum tables reached','validate',{limit:'maxTablesPerDatabase'});const defs=splitCSV(m[3]);if(defs.length>limits.maxColumnsPerTable)fail('RESOURCE_LIMIT','Maximum columns exceeded','validate',{limit:'maxColumnsPerTable'});const columns=[];for(const def of defs){if(/^PRIMARY\s+KEY|^UNIQUE\s*\(|^FOREIGN\s+KEY/i.test(def))fail('NOT_SUPPORTED','Table-level constraints are outside V1 subset','parse',{unsupportedFeature:'TABLE_LEVEL_CONSTRAINT'});columns.push(parseColumnDef(def));}if(new Set(columns.map(c=>c.name)).size!==columns.length)fail('ER_DUP_FIELDNAME','Duplicate column name','validate');if(columns.filter(c=>c.autoIncrement).length>1)fail('ER_WRONG_AUTO_KEY','Only one AUTO_INCREMENT column is allowed','validate');d.tables[name]={name,columns,rows:[],auto:{}};rebuildUniqueIndexes(d.tables[name]);const result={affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD(?:\s+COLUMN)?\s+([\s\S]+)$/i)){op='ALTER_ADD_COLUMN';const t=table(m[1]);meta.table=t.name;const c=parseColumnDef(m[2]);if(t.columns.some(x=>x.name===c.name))fail('ER_DUP_FIELDNAME',`Duplicate column name '${c.name}'`);if(t.columns.length>=limits.maxColumnsPerTable)fail('RESOURCE_LIMIT','Maximum columns exceeded','validate',{limit:'maxColumnsPerTable'});t.columns.push(c);for(let i=0;i<t.rows.length;i++){const r=t.rows[i];r[c.name]=c.default!==undefined?clone(c.default):null;}rebuildUniqueIndexes(t);for(let i=0;i<t.rows.length;i++)validateRow(t,t.rows[i],i);const result={affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+DROP(?:\s+COLUMN)?\s+`?(\w+)`?$/i)){op='ALTER_DROP_COLUMN';const t=table(m[1]);meta.table=t.name;const idx=t.columns.findIndex(c=>c.name===m[2]);if(idx<0)fail('ER_CANT_DROP_FIELD_OR_KEY',`Can't DROP '${m[2]}'; check that column/key exists`);t.columns.splice(idx,1);for(const r of t.rows)delete r[m[2]];delete t.auto[m[2]];rebuildUniqueIndexes(t);const result={affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+MODIFY(?:\s+COLUMN)?\s+([\s\S]+)$/i)){op='ALTER_MODIFY_COLUMN';const t=table(m[1]);meta.table=t.name;const nc=parseColumnDef(m[2]);const idx=t.columns.findIndex(c=>c.name===nc.name);if(idx<0)fail('ER_BAD_FIELD_ERROR',`Unknown column '${nc.name}'`);const old=t.columns[idx];t.columns[idx]=nc;try{rebuildUniqueIndexes(t);for(let i=0;i<t.rows.length;i++)validateRow(t,t.rows[i],i);}catch(e){t.columns[idx]=old;rebuildUniqueIndexes(t);throw e;}const result={affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?`?(\w+)`?$/i)){op='DROP_TABLE';const ife=!!m[1],d=db(),name=ident(m[2]);meta.table=name;if(!d.tables[name]){if(ife){const result={affectedRows:0,warningCount:1};meta.warnings=['TABLE_NOT_FOUND'];return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}fail('ER_NO_SUCH_TABLE',`Table '${name}' doesn't exist`);}delete d.tables[name];const result={affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^INSERT\s+INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+)$/i)){op='INSERT';const t=table(m[1]);meta.table=t.name;const cols=splitCSV(m[2]).map(ident);for(const c of cols)column(t,c);const tuples=splitCSV(m[3]);if(!tuples.length||tuples.some(x=>!/^\([\s\S]*\)$/.test(x.trim())))fail('ER_PARSE_ERROR','Malformed VALUES list','parse');if(t.rows.length+tuples.length>limits.maxRowsPerTable)fail('RESOURCE_LIMIT','Maximum rows exceeded','validate',{limit:'maxRowsPerTable'});let firstInsertId=0;for(const tuple of tuples){checkAbort(start,signal);const vals=splitCSV(tuple.trim().slice(1,-1)).map(literal);if(cols.length!==vals.length)fail('ER_WRONG_VALUE_COUNT','Column count does not match value count');const row={};for(const c of t.columns)row[c.name]=c.default!==undefined?clone(c.default):null;cols.forEach((c,i)=>row[c]=vals[i]);for(const c of t.columns.filter(x=>x.autoIncrement)){if(row[c.name]==null){t.auto[c.name]=(t.auto[c.name]||0)+1;row[c.name]=t.auto[c.name];}else{const n=coerce(c,row[c.name]);t.auto[c.name]=Math.max(t.auto[c.name]||0,n);row[c.name]=n;}}validateRow(t,row);t.rows.push(row);addUniqueIndexRow(t,row,t.rows.length-1);if(!firstInsertId){const ac=t.columns.find(x=>x.autoIncrement);firstInsertId=ac?row[ac.name]:0;}}
        const result={affectedRows:tuples.length,insertId:firstInsertId};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      // JOIN SELECT first
      if(m=sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?\s+(INNER|LEFT)\s+JOIN\s+`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+([\w.`]+)\s*=\s*([\w.`]+)(?:\s+WHERE\s+([\s\S]*?))?(?:\s+ORDER\s+BY\s+([\w.`]+)\s*(ASC|DESC)?)?(?:\s+LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?)?$/i)){op=m[4].toUpperCase()==='LEFT'?'LEFT_JOIN':'INNER_JOIN';const lt=table(m[2]),la=m[3]||m[2],rt=table(m[5]),ra=m[6]||m[5];meta.table=`${lt.name},${rt.name}`;meta.plan='HASH_JOIN';const available=[...availableColsForTable(lt,la),...availableColsForTable(rt,ra)];const lkey=ident(m[7]),rkey=ident(m[8]);if(!available.includes(lkey)||!available.includes(rkey))fail('ER_BAD_FIELD_ERROR','Unknown column in JOIN ON','validate');let rows=[];const belongs=(key,tname,alias)=>{const p=key.includes('.')?key.split('.')[0]:null;return p==null?null:(p===tname||p===alias);};let leftKey=lkey,rightKey=rkey;if(belongs(lkey,rt.name,ra)&&belongs(rkey,lt.name,la)){leftKey=rkey;rightKey=lkey;}const hash=new Map();for(const rr0 of rt.rows){checkAbort(start,signal);const rr=prefixedRow(rr0,rt.name,ra);const kv=rr[rightKey]!==undefined?rr[rightKey]:rr[rightKey.split('.').pop()];if(kv==null)continue;const k=indexKey(kv);let bucket=hash.get(k);if(!bucket)hash.set(k,(bucket=[]));bucket.push(rr);}for(const lr0 of lt.rows){checkAbort(start,signal);const lr=prefixedRow(lr0,lt.name,la);const lv=lr[leftKey]!==undefined?lr[leftKey]:lr[leftKey.split('.').pop()];const bucket=lv==null?null:hash.get(indexKey(lv));if(bucket&&bucket.length){for(const rr of bucket)rows.push({...lr,...rr});}else if(op==='LEFT_JOIN'){const nulls={};for(const c of rt.columns){nulls[c.name]=null;nulls[`${rt.name}.${c.name}`]=null;nulls[`${ra}.${c.name}`]=null;}rows.push({...lr,...nulls});}}
        if(m[9])rows=rows.filter(parseWhere(m[9],available));if(m[10]){if(!available.includes(ident(m[10]))&&!available.includes(ident(m[10]).split('.').pop()))fail('ER_BAD_FIELD_ERROR',`Unknown column '${m[10]}' in 'order clause'`,'validate');const k=ident(m[10]);rows.sort((a,b)=>(a[k]===b[k]?0:a[k]>b[k]?1:-1)*(String(m[11]||'ASC').toUpperCase()==='DESC'?-1:1));}if(m[12])rows=rows.slice(Number(m[13]||0),Number(m[13]||0)+Number(m[12]));rows=projectRows(rows,m[1],available);if(rows.length>limits.maxResultRows)fail('RESOURCE_LIMIT','Result row limit exceeded','execute',{limit:'maxResultRows'});const result={rows,rowCount:rows.length,affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',{rowCount:rows.length,affectedRows:0},null,before,meta)};}
      if(m=sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+([\s\S]*?))?(?:\s+ORDER\s+BY\s+`?([\w.]+)`?\s*(ASC|DESC)?)?(?:\s+LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?)?$/i)){op='SELECT';const t=table(m[2]);meta.table=t.name;const available=availableColsForTable(t);let rows;const where=m[3]?parseWhere(m[3],available):null;const eq=where?.simpleEquality;const eqCol=eq?ident(eq.column).split('.').pop():null;const indexedCol=eqCol?t.columns.find(c=>c.name===eqCol&&(c.primary||c.unique)):null;if(indexedCol&&eq.value!=null){const hit=ensureUniqueIndexes(t)[eqCol][indexKey(eq.value)];rows=hit===undefined?[]:[prefixedRow(t.rows[hit],t.name)];meta.plan='UNIQUE_INDEX_LOOKUP';}else{rows=t.rows.map(r=>prefixedRow(r,t.name));meta.plan='TABLE_SCAN';if(where)rows=rows.filter(where);}if(m[4]){column(t,m[4]);const k=ident(m[4]).split('.').pop();rows.sort((a,b)=>(a[k]===b[k]?0:a[k]>b[k]?1:-1)*(String(m[5]||'ASC').toUpperCase()==='DESC'?-1:1));}if(m[6])rows=rows.slice(Number(m[7]||0),Number(m[7]||0)+Number(m[6]));rows=projectRows(rows,m[1],available);if(rows.length>limits.maxResultRows)fail('RESOURCE_LIMIT','Result row limit exceeded','execute',{limit:'maxResultRows'});const result={rows,rowCount:rows.length,affectedRows:0};return{result,evidence:evidence(sql,op,start,'PASS',{rowCount:rows.length,affectedRows:0},null,before,meta)};}
      if(m=sql.match(/^UPDATE\s+`?(\w+)`?\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i)){op='UPDATE';const t=table(m[1]),available=availableColsForTable(t),where=parseWhere(m[3],available);meta.table=t.name;const assign=splitCSV(m[2]).map(x=>{const z=x.match(/^`?(\w+)`?\s*=\s*(.+)$/);if(!z)fail('ER_PARSE_ERROR',`Bad assignment ${x}`,'parse');column(t,z[1]);return[z[1],literal(z[2])];});let n=0;for(let i=0;i<t.rows.length;i++){checkAbort(start,signal);const r=t.rows[i];if(where(prefixedRow(r,t.name))){const next={...r};for(const[k,v]of assign){if(v&&v.identifier)fail('NOT_SUPPORTED','Column-to-column UPDATE expressions are outside V1 subset','parse',{unsupportedFeature:'UPDATE_EXPRESSION'});next[k]=v;}validateRow(t,next,i);t.rows[i]=next;replaceUniqueIndexRow(t,r,next,i);n++;}}const result={affectedRows:n};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      if(m=sql.match(/^DELETE\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+([\s\S]+))?$/i)){op='DELETE';const t=table(m[1]),available=availableColsForTable(t),where=parseWhere(m[2],available);meta.table=t.name;const kept=[];let n=0;for(const r of t.rows){checkAbort(start,signal);if(where(prefixedRow(r,t.name)))n++;else kept.push(r);}t.rows=kept;rebuildUniqueIndexes(t);const result={affectedRows:n};return{result,evidence:evidence(sql,op,start,'PASS',result,null,before,meta)};}
      op='NOT_SUPPORTED';fail('NOT_SUPPORTED','SQL statement is outside the verified V1 subset','parse',{unsupportedFeature:'STATEMENT'});
    }catch(error){state=before;const ev=evidence(sql,op,start,'FAIL',null,error,before,meta);error.evidence=ev;throw error;}
  }


  const transaction={active:false,journal:[],savepoints:new Map(),startedAt:null};
  function txStatus(){return {active:transaction.active,journalLength:transaction.journal.length,savepoints:[...transaction.savepoints.keys()],startedAt:transaction.startedAt};}
  function tableRef(snapshot,databaseName,tableName){return snapshot?.databases?.[databaseName]?.tables?.[tableName]||null;}
  function createJournalEntry(before,after,ev){
    const op=ev?.operation||'UNKNOWN';let database=ev?.database||before.currentDatabase||after.currentDatabase;const tableName=ev?.table?.includes(',')?null:ev?.table;
    if(op==='CREATE_DATABASE')database=Object.keys(after.databases).find(k=>!before.databases[k])||database;
    if(op==='DROP_DATABASE')database=Object.keys(before.databases).find(k=>!after.databases[k])||database;
    if(op==='SELECT'||op==='INNER_JOIN'||op==='LEFT_JOIN')return null;
    if(op==='CREATE_DATABASE')return {type:'DROP_DATABASE',database};
    if(op==='DROP_DATABASE')return {type:'RESTORE_DATABASE',database,databaseState:clone(before.databases[database]),currentDatabase:before.currentDatabase};
    if(op==='USE')return {type:'SET_CURRENT_DATABASE',database:before.currentDatabase};
    if(op==='CREATE_TABLE')return {type:'DROP_TABLE',database,table:tableName};
    if(op==='DROP_TABLE')return {type:'RESTORE_TABLE',database,table:tableName,tableState:clone(tableRef(before,database,tableName))};
    if(op==='INSERT'){
      const b=tableRef(before,database,tableName),a=tableRef(after,database,tableName);
      return {type:'RESTORE_TABLE_ROWS',database,table:tableName,rows:clone(b?.rows||[]),auto:clone(b?.auto||{})};
    }
    if(op==='UPDATE'||op==='DELETE'){
      const b=tableRef(before,database,tableName);
      return {type:'RESTORE_TABLE_ROWS',database,table:tableName,rows:clone(b?.rows||[]),auto:clone(b?.auto||{})};
    }
    if(op.startsWith('ALTER_'))return {type:'RESTORE_TABLE',database,table:tableName,tableState:clone(tableRef(before,database,tableName))};
    return {type:'RESTORE_STATE',state:clone(before)};
  }
  function undoJournalEntry(entry){
    if(!entry)return;
    if(entry.type==='DROP_DATABASE'){delete state.databases[entry.database];if(state.currentDatabase===entry.database)state.currentDatabase=null;return;}
    if(entry.type==='RESTORE_DATABASE'){state.databases[entry.database]=clone(entry.databaseState);for(const t of Object.values(state.databases[entry.database]?.tables||{}))rebuildUniqueIndexes(t);state.currentDatabase=entry.currentDatabase;return;}
    if(entry.type==='SET_CURRENT_DATABASE'){state.currentDatabase=entry.database;return;}
    if(entry.type==='DROP_TABLE'){const d=state.databases[entry.database];if(d)delete d.tables[entry.table];return;}
    if(entry.type==='RESTORE_TABLE'){const d=state.databases[entry.database];if(d&&entry.tableState){d.tables[entry.table]=clone(entry.tableState);rebuildUniqueIndexes(d.tables[entry.table]);}return;}
    if(entry.type==='RESTORE_TABLE_ROWS'){const t=state.databases[entry.database]?.tables?.[entry.table];if(t){t.rows=clone(entry.rows);t.auto=clone(entry.auto||{});rebuildUniqueIndexes(t);}return;}
    if(entry.type==='RESTORE_STATE'){state=clone(entry.state);for(const d of Object.values(state.databases||{}))for(const t of Object.values(d.tables||{}))rebuildUniqueIndexes(t);}
  }
  function beginTransaction(){if(transaction.active)fail('ER_TX_ACTIVE','Transaction already active','transaction');transaction.active=true;transaction.journal=[];transaction.savepoints.clear();transaction.startedAt=new Date().toISOString();return txStatus();}
  function commitTransaction(){if(!transaction.active)fail('ER_NO_ACTIVE_TX','No active transaction','transaction');const count=transaction.journal.length;transaction.active=false;transaction.journal=[];transaction.savepoints.clear();transaction.startedAt=null;return {committed:true,journalEntries:count};}
  function createSavepoint(name){if(!transaction.active)fail('ER_NO_ACTIVE_TX','No active transaction','transaction');name=ident(name);transaction.savepoints.set(name,transaction.journal.length);return {savepoint:name,journalIndex:transaction.journal.length};}
  function releaseSavepoint(name){if(!transaction.active)fail('ER_NO_ACTIVE_TX','No active transaction','transaction');name=ident(name);if(!transaction.savepoints.has(name))fail('ER_SP_DOES_NOT_EXIST',`Savepoint '${name}' does not exist`,'transaction');transaction.savepoints.delete(name);return {released:name};}
  function rollbackTransaction(savepoint=null){
    if(!transaction.active)fail('ER_NO_ACTIVE_TX','No active transaction','transaction');
    let target=0;
    if(savepoint!=null){savepoint=ident(savepoint);if(!transaction.savepoints.has(savepoint))fail('ER_SP_DOES_NOT_EXIST',`Savepoint '${savepoint}' does not exist`,'transaction');target=transaction.savepoints.get(savepoint);}
    const undone=transaction.journal.length-target;
    while(transaction.journal.length>target)undoJournalEntry(transaction.journal.pop());
    if(savepoint==null){transaction.active=false;transaction.savepoints.clear();transaction.startedAt=null;}else{for(const [name,index] of [...transaction.savepoints])if(index>target)transaction.savepoints.delete(name);}
    return {rolledBack:true,to:savepoint,undone};
  }
  async function transactionCommand(sql){
    if(!/^(?:BEGIN(?:\s+WORK)?|START\s+TRANSACTION|COMMIT(?:\s+WORK)?|ROLLBACK(?:\s+WORK)?|ROLLBACK\s+TO(?:\s+SAVEPOINT)?\s+|SAVEPOINT\s+|RELEASE\s+SAVEPOINT\s+)/i.test(sql))return null;
    const start=perfNow(),before=clone(state);let op='TRANSACTION';let result;
    try{
      if(/^BEGIN(?:\s+WORK)?$/i.test(sql)||/^START\s+TRANSACTION$/i.test(sql)){op='BEGIN';result=beginTransaction();}
      else if(/^COMMIT(?:\s+WORK)?$/i.test(sql)){op='COMMIT';result=commitTransaction();}
      else {let m;if((m=sql.match(/^SAVEPOINT\s+`?([A-Za-z_]\w*)`?$/i))){op='SAVEPOINT';result=createSavepoint(m[1]);}
      else if((m=sql.match(/^RELEASE\s+SAVEPOINT\s+`?([A-Za-z_]\w*)`?$/i))){op='RELEASE_SAVEPOINT';result=releaseSavepoint(m[1]);}
      else if((m=sql.match(/^ROLLBACK\s+TO(?:\s+SAVEPOINT)?\s+`?([A-Za-z_]\w*)`?$/i))){op='ROLLBACK_TO_SAVEPOINT';result=rollbackTransaction(m[1]);}
      else if(/^ROLLBACK(?:\s+WORK)?$/i.test(sql)){op='ROLLBACK';result=rollbackTransaction();}
      else return null;}
      return {result,evidence:evidence(sql,op,start,'PASS',result,null,before,{plan:'TRANSACTION_JOURNAL'})};
    }catch(error){const ev=evidence(sql,op,start,'FAIL',null,error,before,{plan:'TRANSACTION_JOURNAL'});error.evidence=ev;throw error;}
  }
  async function query(input,params={}){
    let sql=typeof input==='string'?input:input?.sql;sql=ensureSql(sql);
    const txResult=await transactionCommand(sql);if(txResult)return txResult;
    const before=transaction.active?clone(state):null;
    const out=await executeStatement(input,params);
    if(transaction.active&&out?.evidence?.state_changed){const entry=createJournalEntry(before,state,out.evidence);if(entry)transaction.journal.push(entry);}
    return out;
  }

  function validatePersistedState(v){
    if(!v||typeof v!=='object'||!v.databases||typeof v.databases!=='object'||Array.isArray(v.databases)) fail('STATE_CORRUPT','Persisted VirtualDB state is invalid','storage');
    if(v.currentDatabase!=null&&typeof v.currentDatabase!=='string') fail('STATE_CORRUPT','Persisted currentDatabase is invalid','storage');
    for(const [dn,d] of Object.entries(v.databases)){if(!d||typeof d!=='object'||d.name!==dn||!d.tables||typeof d.tables!=='object'||Array.isArray(d.tables)) fail('STATE_CORRUPT',`Persisted database '${dn}' is invalid`,'storage'); for(const [tn,t] of Object.entries(d.tables)){if(!t||typeof t!=='object'||t.name!==tn||!Array.isArray(t.columns)||!Array.isArray(t.rows)||!t.auto||typeof t.auto!=='object') fail('STATE_CORRUPT',`Persisted table '${dn}.${tn}' is invalid`,'storage'); for(const c of t.columns){if(!c||typeof c.name!=='string'||typeof c.type!=='string') fail('STATE_CORRUPT',`Persisted column in '${dn}.${tn}' is invalid`,'storage');}}}
    if(v.currentDatabase!=null&&!v.databases[v.currentDatabase]) fail('STATE_CORRUPT','Persisted currentDatabase does not exist','storage');
    return true;
  }
  async function save(key='virtualdb:state'){await core.storage.set(key,clone(state));return true;}
  async function saveSafe(key='virtualdb:state'){const pending=`${key}:pending`,backup=`${key}:backup`;const current=await core.storage.get(key);if(current!=null)await core.storage.set(backup,current);const candidate=clone(state);await core.storage.set(pending,candidate);const verify=await core.storage.get(pending);validatePersistedState(verify);await core.storage.set(key,verify);await core.storage.remove(pending);return {saved:true,key,backup:current!=null?backup:null};}
  async function load(key='virtualdb:state',{recover=true}={}){let v=await core.storage.get(key);if(v){try{validatePersistedState(v);}catch(error){if(!recover)throw error;const backup=await core.storage.get(`${key}:backup`);if(!backup)throw error;validatePersistedState(backup);v=backup;}}if(v){const next=clone(v);for(const d of Object.values(next.databases||{}))for(const t of Object.values(d.tables||{}))rebuildUniqueIndexes(t);state=next;}return clone(state);}
  function snapshot(reason='manual'){if(snapshots.length>=limits.maxSnapshots)snapshots.shift();const snap={id:`snap-${Date.now()}-${snapshots.length+1}`,reason,timestamp:new Date().toISOString(),state:clone(state)};snapshots.push(snap);core.timeTravel?.record(`VDB:${reason}`,state);return clone(snap);}
  function restoreSnapshot(snap){if(!snap||!snap.state)throw new TypeError('Valid snapshot required');state=clone(snap.state);for(const d of Object.values(state.databases||{}))for(const t of Object.values(d.tables||{}))rebuildUniqueIndexes(t);return clone(state);}
  function restore(idOrIndex){const snap=typeof idOrIndex==='number'?snapshots[idOrIndex]:snapshots.find(s=>s.id===idOrIndex);if(!snap)return null;return restoreSnapshot(snap);}
  function reset(){state=baseline();return clone(state);}
  function exportEvidence(){
    const summary={run_id:runId,decision:evidenceTotals.unexpected_failures>0?'FAIL':'PASS',...evidenceTotals,retained_events:events.length,compatibility_target:'MySQL/MariaDB behavioral subset for sandbox testing',limits};
    const errors=events.filter(e=>e.errors.length);
    return {summary,result:events.at(-1)||null,events:clone(events),errors:clone(errors),compatibility:Object.fromEntries([...compatibility.entries()])};
  }
  function exportDatabase(format='json'){
    if(format==='json')return JSON.stringify(state,null,2);
    if(format!=='sql')fail('NOT_SUPPORTED',`Export format ${format} unsupported`,'export');
    let out='';for(const[dname,d]of Object.entries(state.databases)){out+=`CREATE DATABASE IF NOT EXISTS \`${dname}\`;\nUSE \`${dname}\`;\n`;for(const[tname,t]of Object.entries(d.tables)){out+=`CREATE TABLE \`${tname}\` (`+t.columns.map(c=>`\`${c.name}\` ${c.type}${c.length?`(${c.length})`:''}${c.notNull?' NOT NULL':''}${c.default!==undefined?` DEFAULT ${typeof c.default==='string'?`'${c.default.replace(/'/g,"\\'")}'`:c.default===null?'NULL':c.default}`:''}${c.autoIncrement?' AUTO_INCREMENT':''}${c.primary?' PRIMARY KEY':c.unique?' UNIQUE':''}`).join(', ')+`);\n`;for(const r of t.rows){const cols=t.columns.map(c=>`\`${c.name}\``).join(',');const vals=t.columns.map(c=>{const v=r[c.name];return v===null?'NULL':typeof v==='number'?String(v):`'${String(v).replace(/'/g,"\\'")}'`;}).join(',');out+=`INSERT INTO \`${tname}\` (${cols}) VALUES (${vals});\n`;}}}return out;
  }
  async function importSQL(sql,{continueOnError=false}={}){if(typeof sql!=='string')throw new TypeError('SQL import must be string');if((typeof Buffer!=='undefined'?Buffer.byteLength(sql):new TextEncoder().encode(sql).length)>limits.maxImportBytes)fail('RESOURCE_LIMIT','Import too large','import',{limit:'maxImportBytes'});const statements=[];let cur='',q=null;for(let i=0;i<sql.length;i++){const c=sql[i];if(q){cur+=c;if(c===q&&sql[i-1]!=="\\")q=null;continue;}if(c==="'"||c==='"'){q=c;cur+=c;continue;}if(c===';'){if(cur.trim())statements.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())statements.push(cur.trim());const results=[];for(const s of statements){try{results.push(await query(s));}catch(e){results.push({error:{code:e.code,message:e.message}});if(!continueOnError)throw e;}}return results;}

  function getCapabilityManifest(){return {engine:'Core12-VirtualDB',engine_version:'1.0-v1-subset',core_version:core.version,target:'MySQL/MariaDB behavioral subset for sandbox testing',capabilities:Object.fromEntries([...compatibility.entries()]),limits:clone(limits),persistence:{memory:'PASS',indexeddb:compatibility.get('INDEXEDDB_PERSISTENCE')?.status||'NOT_TESTED'},evidence:{bounded:true,max_events:limits.maxEvidenceEvents,retained:events.length,dropped:evidenceTotals.dropped_events}};}
  return {query,save,saveSafe,load,snapshot,restore,restoreSnapshot,reset,exportEvidence,exportDatabase,importSQL,getState:()=>clone(state),getEvidence:()=>clone(events),getSnapshots:()=>clone(snapshots),getCompatibility:()=>Object.fromEntries([...compatibility.entries()]),getCapabilityManifest,getTransactionStatus:txStatus,beginTransaction,commitTransaction,rollbackTransaction,createSavepoint,releaseSavepoint,limits,runId};
}

function registerVirtualDB(core,options={}){if(!core.services.has('virtualDB'))core.services.register('virtualDB',()=>createVirtualDB({core,...options}));return core.services.get('virtualDB');}
return{createVirtualDB,registerVirtualDB,DEFAULT_LIMITS};
});
