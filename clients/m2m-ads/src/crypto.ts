import crypto from 'crypto';

export function signMessage(message: string, privateKey: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  sign.end();
  return sign.sign(privateKey, 'hex');
}

export function verifyMessage(message: string, signature: string, publicKey: string): boolean {
  const verify = crypto.createVerify('SHA256');
  verify.update(message);
  verify.end();
  return verify.verify(publicKey, signature, 'hex');
}