
import { describe, it, expect } from 'vitest';
import { NonceUtils } from './nonce_utils';
import { Base64 } from 'js-base64';

describe('NonceUtils', () => {
    describe('V2 (Default) Randomization', () => {
        it('should round-trip encode and decode correctly', () => {
            const seq = 123456789n;
            const nonce = NonceUtils.toNonce(seq, 'user1');
            const decoded = NonceUtils.fromNonce(nonce);
            expect(decoded).toBe(seq);
        });

        it('should generate different nonces for the same input', () => {
            const seq = 100n;
            const nonce1 = NonceUtils.toNonce(seq, 'user1');
            const nonce2 = NonceUtils.toNonce(seq, 'user1');

            // They should decode to the same value
            expect(NonceUtils.fromNonce(nonce1)).toBe(seq);
            expect(NonceUtils.fromNonce(nonce2)).toBe(seq);

            // But the strings should be different (due to random salt)
            expect(nonce1).not.toBe(nonce2);
        });

        it('should handle max uint64 correctly', () => {
            const maxSeq = 0xFFFFFFFFFFFFFFFFn;
            const nonce = NonceUtils.toNonce(maxSeq, 'any');
            expect(NonceUtils.fromNonce(nonce)).toBe(maxSeq);
        });

        it('should handle zero correctly', () => {
            const zero = 0n;
            const nonce = NonceUtils.toNonce(zero, 'any');
            expect(NonceUtils.fromNonce(nonce)).toBe(zero);
        });
    });

    describe('V1 Legacy Support', () => {
        it('should decode existing V1 nonces correctly', () => {
            // Manually construct a V1 nonce: [Random(1)] [0x01] [Seq(8)]
            // Let's use 0 as prefix, 0x01 as version, and 12345n as seq
            // 12345n = 0x3039
            const buffer = new Uint8Array(10);
            buffer[0] = 42; // arbitrary random byte
            buffer[1] = 0x01; // V1
            // Write 12345n (0x3039) at the end
            buffer[8] = 0x30;
            buffer[9] = 0x39;

            const v1Nonce = Base64.fromUint8Array(buffer, true);

            const decoded = NonceUtils.fromNonce(v1Nonce);
            expect(decoded).toBe(12345n);
        });

        it('should encode V1 if explicitly requested (though internal)', () => {
            // Access private/protected method via any cast or just test public API with specific version
            // Public API allows passing version
            const seq = 999n;
            const nonce = NonceUtils.toNonce(seq, 'test', 0x01); // V1

            // Should be deterministic if fingerprint is same
            const nonce2 = NonceUtils.toNonce(seq, 'test', 0x01);
            expect(nonce).toBe(nonce2);

            // Should decode correctly
            expect(NonceUtils.fromNonce(nonce)).toBe(seq);
        });
    });

    describe('Error Handling', () => {
        it('should return -1n for invalid nonces', () => {
            expect(NonceUtils.fromNonce('invalid-base64@#$')).toBe(-1n);
            expect(NonceUtils.fromNonce('short')).toBe(-1n); // Too short
        });

        it('should return -1n for unknown version', () => {
            const buffer = new Uint8Array(10);
            buffer[1] = 0xFF; // Unknown version
            const nonce = Base64.fromUint8Array(buffer, true);
            expect(NonceUtils.fromNonce(nonce)).toBe(-1n);
        });

        it('should throw on encoding invalid sequence', () => {
            expect(() => NonceUtils.toNonce(-1n, 'e')).toThrow();
        });
    });
});
