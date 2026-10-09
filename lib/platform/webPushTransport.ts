import { createECDH, createCipheriv, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { request } from 'node:https';
import { pushEndpointAllowed, type TripPushSubscription } from './tripPush';

/** RFC 8291 single-record aes128gcm encryption; keys stay on the server. */
export function encryptPush(subscription: TripPushSubscription, payload: string, options?: { privateKey: Buffer; salt: Buffer }): Buffer {
 const ua = Buffer.from(subscription.keys.p256dh, 'base64url');
 const auth = Buffer.from(subscription.keys.auth, 'base64url');
 if (ua.length !== 65 || ua[0] !== 4 || auth.length !== 16) throw new Error('Invalid push keys');
 const as = createECDH('prime256v1');
 if (options) as.setPrivateKey(options.privateKey); else as.generateKeys();
 const pub = as.getPublicKey();
 const shared = as.computeSecret(ua);
 const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, pub]), 32));
 const salt = options?.salt ?? randomBytes(16);
 const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
 const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
 const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
 if (plain.length > 3994) throw new Error('Push payload too large');
 const cipher = createCipheriv('aes-128-gcm', key, nonce);
 const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
 const header = Buffer.alloc(21); salt.copy(header); header.writeUInt32BE(4096,16); header[20]=pub.length;
 return Buffer.concat([header, pub, encrypted]);
}
export function vapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string): string {
 const pub=Buffer.from(publicKey,'base64url'), priv=Buffer.from(privateKey,'base64url');
 const pair=createECDH('prime256v1'); pair.setPrivateKey(priv);
 if (pub.length!==65 || !pair.getPublicKey().equals(pub)) throw new Error('Invalid VAPID key pair');
 const contact=new URL(subject);
 if (!['mailto:','https:'].includes(contact.protocol)) throw new Error('Invalid VAPID subject');
 const key=createPrivateKey({format:'jwk', key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url'),d:priv.toString('base64url')}});
 const head=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:subject})).toString('base64url');
 const token=head+'.'+claims;
 const signature=sign('sha256',Buffer.from(token),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return 'vapid t='+token+'.'+signature+', k='+publicKey;
}
/** No redirects, bounded request lifetime, allowlisted HTTPS push providers only. */
export async function sendWebPush(subscription: TripPushSubscription, payload: string): Promise<number> {
 if (!pushEndpointAllowed(subscription.endpoint)) throw new Error('Unsupported push provider');
 const body=encryptPush(subscription,payload);
 const authorization=vapidAuthorization(subscription.endpoint,process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY!,process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,process.env.WEB_PUSH_VAPID_SUBJECT!);
 return new Promise((resolve,reject)=>{
  const req=request(subscription.endpoint,{method:'POST',headers:{Authorization:authorization,TTL:'900',Urgency:'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','Content-Length':body.length}},res=>{res.resume();resolve(res.statusCode??500);});
  const timeout=setTimeout(()=>req.destroy(new Error('Push request timed out')),10000);
  req.on('close',()=>clearTimeout(timeout));req.on('error',reject);req.end(body);
 });
}
