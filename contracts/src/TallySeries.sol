// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TallySeries
/// @notice ERC-20 receipt for one quarterly series. 1 token = 1 receipt = 1 NCU.
/// Plain ERC-20: no fees, hooks or blocklists on transfer. Only the hub mints and burns.
contract TallySeries is ERC20 {
    address public immutable hub;
    uint256 public immutable seriesId;

    error OnlyHub();

    constructor(string memory name_, string memory symbol_, uint256 seriesId_) ERC20(name_, symbol_) {
        hub = msg.sender;
        seriesId = seriesId_;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != hub) revert OnlyHub();
        _mint(to, amount);
    }

    /// @dev The hub burns receipts the holder is redeeming, settling or using to liquidate.
    function burn(address from, uint256 amount) external {
        if (msg.sender != hub) revert OnlyHub();
        _burn(from, amount);
    }
}
