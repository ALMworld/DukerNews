// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Product category for DUKIGEN agents.
enum ProductType {
    UNSPECIFIED,   // 0
    DIGITAL,       // 1 — Apps, software, SaaS, digital goods
    PHYSICAL,      // 2 — Hardware, manufactured goods
    SERVICE        // 3 — Consulting, professional services
}

/// @notice DUKI contribution model.
///         REVENUE_SHARE: DUKI is minted on-chain in real-time with every payment.
///         PROFIT_SHARE:  Agent pledges a share of profits — contributed periodically or via contract.
///                        pay() sends 100% to agentWallet (no automatic DUKI minting).
enum DukiType {
    UNSPECIFIED,     // 0
    REVENUE_SHARE,   // 1 — real-time DUKI minting on each payment (营业额分成)
    PROFIT_SHARE     // 2 — profit-share pledge, contributed separately (利润分成)
}

/// @notice On-chain agent/dApp record for the DUKIGEN ecosystem.
///
///         dukiBps controls the DUKI ecosystem share on every payment:
///           - defaultDukiBps: used when payer doesn't specify
///           - minDukiBps / maxDukiBps: range the payer can choose from
///
///         Example: minDukiBps=5000, maxDukiBps=9900, defaultDukiBps=5000
///           User pays 100 USDT with dukiBps=7000:
///             70 USDT → AlmWorldDukiMinter (DUKI + ALM)
///             30 USDT → agentWallet
struct AgentRecord {
    // ── Identity ────────────────────────────────
    string name;              // unique agent/works name (spaces allowed)
    string agentURI;          // project URL / registration JSON (ERC-8004)
    uint32 originChainEid;    // LayerZero EID where first registered

    // ── Payment config ─────────────────────────
    uint16 defaultDukiBps;    // default basis points for DUKI ecosystem share
    uint16 minDukiBps;        // minimum dukiBps a payer can choose
    uint16 maxDukiBps;        // maximum dukiBps a payer can choose

    // ── Works metadata ─────────────────────────
    ProductType productType;  // Digital / Physical / Service
    DukiType dukiType;        // Revenue / Profit
    string pledgeUrl;         // DUKI pledge / governance page (optional)
    string[] tags;            // ["ai", "web3", "oss"]
}
