// Operator-only key generation. Writes an exclusive owner-readable file; prints only its public RFC 7638 thumbprint.
import {webcrypto,createHash} from 'node:crypto';
import {writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function generatePrivateFile(outPath) {
  if (!outPath||!isAbsolute(outPath)) throw Error('Specify an absolute private output path outside the repository.');
  const repo=await realpath(fileURLToPath(new URL('../../',import.meta.url))),parent=await realpath(dirname(outPath));
  const rel=relative(repo,parent);
  if (!rel||(!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&rel!=='..'&&!isAbsolute(rel))) throw Error('Choose a private directory outside the repository.');
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.privateKey),publicKey={crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y};
  const pin=createHash('sha256').update(JSON.stringify(publicKey)).digest('base64url');
  await writeFile(outPath,JSON.stringify(jwk),{flag:'wx',mode:0o600});
  return pin;
}
if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.stdout.write('offlineGrantPin = '+await generatePrivateFile(process.argv[2])+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
