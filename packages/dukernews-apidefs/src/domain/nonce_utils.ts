import { Base64 } from 'js-base64';

// User explicitly set this to 0x01, aligning with the new Single-Version policy
const CURRENT_VERSION = 0x01;

enum NonceVersion {
    V1_OBFUSCATED = 0x01,
}

export class NonceUtils {
    // Zero nonce is also obfuscated now.
    // Using fixed salt 0 for deterministic zero nonce.
    static readonly FIXED_ZERO_NONCE = NonceUtils.encodeV1(0n, 0);

    /**
     * Converts a sequence number (uint64) into a versioned nonce string.
     * Format: [Salt(1B)] [Version(1B)] [ObfuscatedSequence(8B)]
     * @param seq The sequence number to encode.
     * @param ego Excepted for API compatibility, but unused.
     * @param version The version to encode with (defaults to current).
     */
    static toNonce(seq: bigint | number | string, ego: string, version: number = CURRENT_VERSION): string {
        const seqBn = BigInt(seq);
        if (seqBn < 0n || seqBn > 0xFFFFFFFFFFFFFFFFn) {
            throw new Error("Sequence number must be a valid 64-bit unsigned integer");
        }

        switch (version) {
            case NonceVersion.V1_OBFUSCATED:
                return this.encodeV1(seqBn);
            default:
                throw new Error(`Unsupported nonce version for encoding: ${version}`);
        }
    }

    /**
     * Recovers the sequence number from a nonce string.
     */
    static fromNonce(nonce: string, allowEmpty: boolean = false): bigint {
        if (!nonce) return allowEmpty ? 0n : -1n;
        // Decode Base64URL
        let buffer: Uint8Array;
        try {
            buffer = this.fromBase64Url(nonce);
        } catch (e) {
            return -1n;
        }

        if (buffer.length < 2) {
            return -1n;
        }

        // byte 0 is salt/random/fingerprint, byte 1 is version
        const version = buffer[1];

        switch (version) {
            case NonceVersion.V1_OBFUSCATED:
                return this.decodeV1(buffer);
            default:
                // Fallback for potentially old nonces if we wanted to support them, 
                // but instructions said "only keep V2... rename to V1".
                // So we strictly fail on anything else.
                return -1n;
        }
    }

    // --- Version Implementations ---

    /**
     * Encodes using V1 Obfuscation (formerly V2 logic).
     * @param seq Sequence number
     * @param fixedSalt Optional salt to force determinism (e.g. for FIXED_ZERO_NONCE)
     */
    private static encodeV1(seq: bigint, fixedSalt?: number): string {
        // Format: [Salt(1)] [Version(1)] [ObfuscatedSequence(8)]
        const buffer = new Uint8Array(10);

        // 1. Generate random salt (1 byte) or use fixed
        const salt = fixedSalt !== undefined ? fixedSalt : Math.floor(Math.random() * 256);
        buffer[0] = salt;

        // 2. Set version
        buffer[1] = NonceVersion.V1_OBFUSCATED;

        // 3. Obfuscate sequence
        this.writeBigInt64BEObfuscated(buffer, 2, seq, salt);

        return this.toBase64Url(buffer);
    }

    private static decodeV1(buffer: Uint8Array): bigint {
        if (buffer.length !== 10) {
            return -1n;
        }
        const salt = buffer[0];
        return this.readBigInt64BEObfuscated(buffer, 2, salt);
    }

    // --- Helpers ---

    private static writeBigInt64BEObfuscated(buf: Uint8Array, offset: number, val: bigint, salt: number) {
        let v = val;
        for (let i = 7; i >= 0; i--) {
            const byteVal = Number(v & 0xFFn);
            buf[offset + i] = byteVal ^ salt;
            v >>= 8n;
        }
    }

    private static readBigInt64BEObfuscated(buf: Uint8Array, offset: number, salt: number): bigint {
        let val = 0n;
        for (let i = 0; i < 8; i++) {
            const byteVal = buf[offset + i] ^ salt;
            val = (val << 8n) | BigInt(byteVal);
        }
        return val;
    }

    private static toBase64Url(buffer: Uint8Array): string {
        return Base64.fromUint8Array(buffer, true);
    }

    private static fromBase64Url(str: string): Uint8Array {
        return Base64.toUint8Array(str);
    }
}
