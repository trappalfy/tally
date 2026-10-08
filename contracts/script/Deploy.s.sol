// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TallyHub} from "../src/TallyHub.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url mainnet --broadcast
/// Env: DEPLOYER_PRIVATE_KEY, USDG_ADDRESS, OWNER_SAFE, ARBITER_SAFE, TREASURY.
/// Opens the current series when OPEN_SERIES=1 and the deployer is the owner (OWNER_SAFE unset);
/// otherwise the owner Safe calls openSeries(year, quarter) itself.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address usdg = vm.envAddress("USDG_ADDRESS");
        address owner = vm.envOr("OWNER_SAFE", deployer);
        address arbiter = vm.envOr("ARBITER_SAFE", deployer);
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(pk);
        TallyHub hub = new TallyHub(IERC20(usdg), owner, arbiter, treasury);
        if (owner == deployer && vm.envOr("OPEN_SERIES", uint256(1)) == 1) {
            hub.openSeries(uint16(vm.envOr("SERIES_YEAR", uint256(2026))), uint8(vm.envOr("SERIES_QUARTER", uint256(4))));
        }
        vm.stopBroadcast();

        console.log("TallyHub", address(hub));
        console.log("owner", owner);
        console.log("arbiter", arbiter);
        console.log("treasury", treasury);
    }
}
