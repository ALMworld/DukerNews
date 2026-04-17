// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukerRegistryEnums
/// @notice Auto-generated enums for DukerRegistry.
///         GENERATED FROM proto definitions — DO NOT EDIT MANUALLY.
///         Re-generate with: pnpm --filter dukiregistry-apidefs gen:sol-enums
interface IDukerRegistryEnums {

    // GENERATED FROM proto — DO NOT EDIT MANUALLY
    // Re-generate with: pnpm --filter @repo/dukiregistry-apidefs gen:sol-enums
    enum DukerEventType {
        UNSPECIFIED,                            // 0
        USER_MINTED,                            // 1
        IDENTITY_REPLICATE_SENT,                // 2
        IDENTITY_BURNED,                        // 3
        IDENTITY_REPLICATE_RECEIVED_PENDING,    // 4
        IDENTITY_REPLICATE_RECEIVED_CLAIMED,    // 5
        IDENTITY_REPLICATE_RECEIVED_REJECTED,   // 6
        IDENTITY_PREFERENCES_SET                // 7
    }

    // GENERATED FROM proto — DO NOT EDIT MANUALLY
    // Re-generate with: pnpm --filter @repo/dukiregistry-apidefs gen:sol-enums
    enum RejectReason {
        UNSPECIFIED,                            // 0
        ALREADY_REPLICATED,                     // 1
        ALREADY_HAS_IDENTITY,                   // 2
        USER_REJECTED                           // 3
    }
}
