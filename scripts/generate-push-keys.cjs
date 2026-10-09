// Run locally; store the private key only in your secret manager. Never commit the output.
const {createECDH}=require('node:crypto');const key=createECDH('prime256v1');
console.log('NEXT_PUBLIC_WEB_PUSH_VAPID_KEY='+key.generateKeys().toString('base64url'));
console.log('WEB_PUSH_VAPID_PRIVATE_KEY='+key.getPrivateKey().toString('base64url'));
