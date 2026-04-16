// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IChingDeal — QianKunDEAL Payment Standard
 * @notice On-chain product registration and payment interface.
 *         Every purchase is a "Kind Change" (kind易) recorded forever.
 *
 * @author KindKang2024
 */
interface IChingDeal {
    // ─── Types ───

    struct Product {
        uint128 perPrice; // 0 = tip/donation; denominated in stablecoin (d18)
        uint128 dukiPerPrice; // DUKI (Kun/Earth) amount per deal in stablecoin (d18)
        string hasContentHashUrl; // URL whose content is self-verifiable via embedded content hash
        bool active;
    }

    // ─── QianKunDEAL Events ───

    /// @notice Emitted on every purchase / tip
    event QianKunDeal(uint64 indexed dealId, uint64 indexed productId, uint128 moneyAmount, uint128 dukiAmount);

    /// @notice Emitted when a product is registered
    event QianKunProductRegistered(
        uint64 indexed productId, uint128 perPrice, uint128 dukiPerPrice, string hasContentHashUrl
    );

    // ─── Functions ───

    /// @notice Register a new product in the on-chain product registry
    /// @param id               Unique product identifier chosen by the merchant
    /// @param perPrice         Price per deal in stablecoin (d18); 0 for tip/donation
    /// @param dukiPerPrice     DUKI (Kun/Earth) amount per deal in stablecoin (d18)
    /// @param hasContentHashUrl URL with embedded content hash for self-verification
    function registerProduct(uint64 id, uint128 perPrice, uint128 dukiPerPrice, string calldata hasContentHashUrl)
        external;

    /// @notice Make a kind deal (purchase / tip / donation)
    /// @param productId The product to purchase
    /// @param amount    Payment amount in stablecoin (d18); must >= perPrice
    function kindDeal(uint64 productId, uint128 amount) external;

    /// @notice Get product details
    function getProduct(uint64 productId) external view returns (Product memory);
}
