'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.site');
fs.rmSync(out,{recursive:true,force:true});
for(const dir of ['core','sandbox','ui'])fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
fs.mkdirSync(path.join(out,'evidence'),{recursive:true});
for(const file of ['index.html','llms.txt','ai-manifest.json','AGENTS.md']){const src=path.join(root,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,file));}
fs.mkdirSync(path.join(out,'docs'),{recursive:true});
for(const file of ['AI-USAGE.md','ARCHITECTURE.md','COMPATIBILITY.md']){const src=path.join(root,'docs',file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,'docs',file));}
for(const file of ['capability-manifest.json','sandbox-compatibility.json','progress.json','FINAL-STATUS.json']){
  const src=path.join(root,'evidence',file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,'evidence',file));
}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(`Pages site built: ${out}`);
