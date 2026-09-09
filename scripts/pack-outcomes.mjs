import {readFile, writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
const original=await readFile(new URL('../data/outcomes.json',import.meta.url));
const packed=gzipSync(original,{level:9});
if(!gunzipSync(packed).equals(original)) throw Error('Round-trip mismatch');
await writeFile(new URL('../data/outcomes.json.gz',import.meta.url),packed);
console.log({originalBytes:original.length,packedBytes:packed.length,rows:JSON.parse(original).length});
