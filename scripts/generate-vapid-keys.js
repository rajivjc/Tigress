#!/usr/bin/env node
/**
 * One-off VAPID key generator for Tigress Web Push.
 *
 * Usage:
 *     node scripts/generate-vapid-keys.js
 *
 * Copy the output into Vercel / .env.local:
 *     NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
 *     VAPID_PRIVATE_KEY=...
 *
 * The public key is exposed to the browser and is used by
 * `registration.pushManager.subscribe({ applicationServerKey })`.
 * The private key stays on the server and is used by `web-push` to sign
 * outgoing push payloads.
 *
 * Generate once per environment. Rotating the keys invalidates every existing
 * subscription, so clients will have to re-subscribe from the profile page.
 */

const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
