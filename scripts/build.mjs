import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
// Explicit allowlist: server code, SQL, tests, secrets and documentation never ship.
for(const entry of ['index.html','auth.html','pages','assets','css','js'])fs.cpSync(path.join(root,entry),path.join(out,entry),{recursive:true});
console.log('Static site built into dist/. Deploy only this directory.');
