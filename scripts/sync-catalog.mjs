import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'supabase/functions/_shared/catalog.json'),'utf8'));
fs.writeFileSync(path.join(root,'js/catalog.js'),'// Display catalog only. Authoritative checkout prices are on the server.\nwindow.VEXON_CATALOG = Object.freeze('+JSON.stringify(catalog,null,2)+');\n');
console.log('Display catalog synchronized. Redeploy create-payment after changing prices.');
