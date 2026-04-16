// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

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
    string name;              // "DukerNews" — unique, immutable after registration
    uint32 originChainEid;    // LayerZero EID where first registered
    uint16 defaultDukiBps;    // default basis points for DUKI ecosystem share
    uint16 minDukiBps;        // minimum dukiBps a payer can choose
    uint16 maxDukiBps;        // maximum dukiBps a payer can choose
}
