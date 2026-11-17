/** Server only: pass just the public key to the device setup screen. */
export function orderPushConfig() {
  const { MAASII_VAPID_PUBLIC_KEY: publicKey, MAASII_VAPID_PRIVATE_KEY: privateKey, MAASII_VAPID_SUBJECT: subject } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : undefined;
}
