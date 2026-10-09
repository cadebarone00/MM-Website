import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,createPublicKey,verify} from 'node:crypto';
import {encryptPush,vapidAuthorization} from './webPushTransport.ts';
import {pushEndpointAllowed,pushSubscriptionFrom} from './tripPush.ts';
test('RFC 8291 published encryption example matches byte-for-byte',()=>{
 const encrypted=encryptPush({endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',auth:'BTBZMqHH6r4Tts7J_aSIgg'}},'When I grow up, I want to be a watermelon',{
 privateKey:Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url'),salt:Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url')});
 assert.equal(encrypted.toString('base64url'),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});
test('VAPID JWT verifies as ES256 and is scoped to the push provider',()=>{
 const pair=createECDH('prime256v1');const pub=pair.generateKeys();const privateKey=pair.getPrivateKey().toString('base64url');
 const auth=vapidAuthorization('https://web.push.apple.com/path',pub.toString('base64url'),privateKey,'mailto:ops@example.com');
 const token=auth.split('t=')[1].split(',')[0];const [h,p,s]=token.split('.');
 assert.equal(JSON.parse(Buffer.from(p,'base64url').toString()).aud,'https://web.push.apple.com');
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')}});
 assert.ok(verify('sha256',Buffer.from(h+'.'+p),{key,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
test('push destinations refuse SSRF, credentials, alternate ports and lookalike providers',()=>{
 for(const bad of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.com/x','https://u:p@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x']) assert.equal(pushEndpointAllowed(bad),false,bad);
 assert.ok(pushEndpointAllowed('https://web.push.apple.com/x'));assert.equal(pushSubscriptionFrom({endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'bad',auth:'bad'}}),null);
});
