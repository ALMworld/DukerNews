
import { NonceUtils } from './nonce_utils';
import { Base64 } from 'js-base64';

console.log("Starting verification...");

// 1. V2 Roundtrip
const seq = 123456789n;
const nonce = NonceUtils.toNonce(seq, 'user1');
console.log("V2 Nonce:", nonce);
const decoded = NonceUtils.fromNonce(nonce);
console.log("Decoded:", decoded);
if (decoded !== seq) {
    console.error(`FAILURE: Expected ${seq}, got ${decoded}`);
    process.exit(1);
}

// 2. Randomization
const nonce2 = NonceUtils.toNonce(seq, 'user1');
console.log("V2 Nonce 2:", nonce2);
if (nonce === nonce2) {
    console.error("FAILURE: Nonces are identical (expected randomization)");
    process.exit(1);
}
if (NonceUtils.fromNonce(nonce2) !== seq) {
    console.error("FAILURE: Nonce 2 decoding failed");
    process.exit(1);
}

// 3. V1 Decode
const buffer = new Uint8Array(10);
buffer[0] = 42;
buffer[1] = 0x01; // V1
// 12345n = 0x3039
buffer[8] = 0x30;
buffer[9] = 0x39;
const v1Nonce = Base64.fromUint8Array(buffer, true);
console.log("V1 Nonce:", v1Nonce);
const decodedV1 = NonceUtils.fromNonce(v1Nonce);
console.log("Decoded V1:", decodedV1);
if (decodedV1 !== 12345n) {
    console.error(`FAILURE: V1 Decode expected 12345, got ${decodedV1}`);
    process.exit(1);
}

console.log("SUCCESS: All checks passed.");
