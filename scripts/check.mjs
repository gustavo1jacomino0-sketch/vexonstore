import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=['js','supabase/functions','scripts','tests'].flatMap(dir=>walk(path.join(root,dir)));
for(const file of files.filter(f=>/\.(js|mjs|ts)$/.test(f)))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const pages=[path.join(root,'index.html'),path.join(root,'auth.html'),...walk(path.join(root,'pages'))];
for(const file of pages){
 const html=fs.readFileSync(file,'utf8');
 assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html),'Inline script: '+file);
 assert(!/\son[a-z]+\s*=/i.test(html),'Inline event: '+file);
 for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)){
  const ref=match[1];if(/^(?:[a-z]+:|#|\/\/)/i.test(ref))continue;
  assert(fs.existsSync(path.resolve(path.dirname(file),ref.split(/[?#]/)[0])),'Missing asset '+ref);
 }
}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'supabase/functions/_shared/catalog.json')));
for(const [id,p] of Object.entries(catalog))assert(/^p-[a-z0-9-]+$/.test(id)&&Number.isSafeInteger(p.price_cents)&&p.price_cents>0,'Invalid catalog');
console.log('Syntax, HTML scripts, local references and catalog checked.');
