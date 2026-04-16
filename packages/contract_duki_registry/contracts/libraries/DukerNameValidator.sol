// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title DukerNameValidator
/// @notice Shared name validation library for DukerRegistry and DukigenRegistry.
///
///         Rules:
///           - 1-192 bytes (~64 CJK chars or 192 ASCII)
///           - dot and at-sign forbidden (reserved as fullId delimiter)
///           - No control chars, no SVG/XML injection chars
///           - No zero-width chars, direction overrides, etc.
///           - No Latin+Cyrillic mixing (homoglyph attack prevention)
library DukerNameValidator {
    uint256 internal constant MAX_NAME_BYTES = 192;

    error InvalidName();

    function validate(string memory name) internal pure {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 1 || len > MAX_NAME_BYTES) revert InvalidName();

        bool hasLatin;
        bool hasCyrillic;

        for (uint256 i = 0; i < len; i++) {
            uint8 c = uint8(b[i]);

            // Control characters + space (0x00-0x20)
            if (c <= 0x20) revert InvalidName();
            // SVG/XML injection chars + reserved delimiters: " & ' . < > @
            if (c == 0x22 || c == 0x26 || c == 0x27 || c == 0x2E || c == 0x3C || c == 0x3E || c == 0x40) revert InvalidName();
            // DEL character
            if (c == 0x7F) revert InvalidName();

            // Track Latin letters
            if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) hasLatin = true;

            // Multi-byte UTF-8 checks
            if (c >= 0x80 && i + 1 < len) {
                uint8 c1 = uint8(b[i + 1]);

                // Track Cyrillic
                if (c >= 0xD0 && c <= 0xD3) hasCyrillic = true;

                // Combining diacritical marks
                if (c == 0xCC) revert InvalidName();
                if (c == 0xCD && c1 <= 0xAF) revert InvalidName();

                // 3-byte sequences
                if (c >= 0xE0 && c <= 0xEF && i + 2 < len) {
                    uint8 c2 = uint8(b[i + 2]);
                    if (c == 0xE2 && (c1 == 0x80 || c1 == 0x81)) revert InvalidName();
                    if (c == 0xE2 && c1 >= 0x91 && c1 <= 0x93) revert InvalidName();
                    if (c == 0xE2 && c1 == 0x82) revert InvalidName();
                    if (c == 0xEF && c1 == 0xAC) revert InvalidName();
                    if (c == 0xEF && c1 == 0xBB && c2 == 0xBF) revert InvalidName();
                    if (c == 0xEF && c1 == 0xB8 && c2 >= 0x80 && c2 <= 0x8F) revert InvalidName();
                    if (c == 0xEF && c1 == 0xB7) revert InvalidName();
                    if (c == 0xEF && c1 == 0xBF && c2 >= 0xB0) revert InvalidName();
                    if (c == 0xEF && (c1 == 0xBC || c1 == 0xBD)) revert InvalidName();
                }

                // Tag characters (4-byte)
                if (c == 0xF3 && c1 == 0xA0) revert InvalidName();
            }
        }

        // Reject Latin + Cyrillic mixing (homoglyph attack prevention)
        if (hasLatin && hasCyrillic) revert InvalidName();
    }
}
