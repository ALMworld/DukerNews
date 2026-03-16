import { Platform } from "../gen/es_pb.js";

const SEPARATOR = ":";

export interface VidInfo {
    platform: Platform;
    tid: string;
}

// Custom shuffled alphabet for "handcrafted" encoding
// Original: 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
const CUSTOM_ALPHABET = "qazwsxedcrfvtgbyhnujmikolpQAZWSXEDCRFVTGBYHNUJMIKOLP1234567890";
const BASE = CUSTOM_ALPHABET.length;

function toBase62(buffer: Uint8Array): string {
    let digits = [0];
    for (let i = 0; i < buffer.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            digits[j] <<= 8;
        }
        digits[0] += buffer[i];
        let carry = 0;
        for (let j = 0; j < digits.length; ++j) {
            digits[j] += carry;
            carry = (digits[j] / BASE) | 0;
            digits[j] %= BASE;
        }
        while (carry) {
            digits.push(carry % BASE);
            carry = (carry / BASE) | 0;
        }
    }
    let res = "";
    for (let i = 0; i < digits.length; i++) {
        res = CUSTOM_ALPHABET[digits[i]] + res;
    }
    return res;
}

function fromBase62(s: string): Uint8Array {
    let digits = [0];
    for (let c of s) {
        let val = CUSTOM_ALPHABET.indexOf(c);
        if (val === -1) throw new Error("Invalid character");
        for (let i = 0; i < digits.length; i++) {
            digits[i] *= BASE;
        }
        digits[0] += val;
        let carry = 0;
        for (let i = 0; i < digits.length; i++) {
            digits[i] += carry;
            carry = (digits[i] / 256) | 0;
            digits[i] %= 256;
        }
        while (carry) {
            digits.push(carry % 256);
            carry = (carry / 256) | 0;
        }
    }
    return new Uint8Array(digits.reverse());
}


/**
 * Encodes a platform and id into a single VID string using custom obfuscation.
 * Format: Base62(PlatformByte + IDBytes)
 */
export function encodeVid(platform: Platform, tid: string): string {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(tid);
    const combined = new Uint8Array(1 + idBytes.length);
    combined[0] = platform; // Platform is enum 0 or 1, fits in byte
    combined.set(idBytes, 1);

    return toBase62(combined);
}

/**
 * Decodes a VID string back into its platform and id components.
 * STRICTLY Supports:
 * 1. New Obfuscated format (Base62)
 */
export function decodeVid(vid: string): VidInfo | null {
    try {
        const bytes = fromBase62(vid);
        if (bytes.length > 1) {
            const platform = bytes[0] as Platform;

            // Validate platform enum exists (keys are strings, values are numbers)
            if (Platform[platform]) {
                const decoder = new TextDecoder();
                const tid = decoder.decode(bytes.slice(1));
                return { platform, tid };
            }
        }
    } catch (e) {
        // Fallthrough to error
        console.error('Error decoding VID:', e);
        return null;
    }

    return null;
}

/**
 * Parses a string which could be a URL or an ID, along with an optional platform hint.
 * If a URL is detected, it attempts to extract the ID and Platform.
 * If just an ID is provided, it needs a platform, or defaults to Youtube if it looks like one?
 */
export function getVid(input: string, platform?: Platform): string {
    // 1. Try to parse as URL
    const urlInfo = parseUrl(input);
    if (urlInfo) {
        return encodeVid(urlInfo.platform, urlInfo.tid);
    }

    // 2. If not a URL, treat input as ID.
    // If platform is provided, use it.
    if (platform !== undefined) {
        return encodeVid(platform, input);
    }

    // 3. If no platform:
    // Check if it's already a valid VID by trying to decode it
    const decoded = decodeVid(input);
    if (decoded) {
        return input; // It's valid
    }
    // Default heuristics?
    if (input.length === 11) {
        return encodeVid(Platform.YOUTUBE, input);
    }
    // Last resort
    return encodeVid(Platform.GENERAL, input);
}


function parseUrl(url: string): VidInfo | null {
    try {
        // Basic check if it looks like a URL
        if (!url.startsWith('http') && !url.includes('youtube') && !url.includes('youtu.be')) {
            return null;
        }

        // YouTube
        // Supported patterns:
        // - youtube.com/watch?v=ID
        // - youtu.be/ID
        // - youtube.com/embed/ID
        // - youtube.com/shorts/ID

        const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(youtubeRegex);
        if (match && match[1]) {
            return { platform: Platform.YOUTUBE, tid: match[1] };
        }

        return null;
    } catch {
        return null;
    }
}
