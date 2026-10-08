// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev USDG stand-in: 6 decimals, issuer freeze and pause like Paxos tokens.
contract MockUSDG is ERC20 {
    mapping(address => bool) public frozen;
    bool public paused;

    constructor() ERC20("Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function freeze(address a, bool f) external {
        frozen[a] = f;
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!paused, "paused");
        require(!frozen[from] && !frozen[to], "frozen");
        super._update(from, to, value);
    }
}
