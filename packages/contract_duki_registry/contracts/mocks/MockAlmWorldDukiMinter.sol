// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mock AlmWorldDukiMinter — just pulls the stablecoin and holds it.
///      In production, this would mint DUKI + ALM tokens.
contract MockAlmWorldDukiMinter {
    /// @notice Called by DukigenRegistry. Pulls payToken from caller.
    function mint(address token, address /*yinReceiver*/, address /*yangReceiver*/, uint256 amount)
        external
    {
        // Pull stablecoin from caller (DukigenRegistry) into this mock
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}
