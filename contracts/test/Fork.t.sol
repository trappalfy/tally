// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TallyHub} from "../src/TallyHub.sol";

/// @dev Full cycle against real USDG on a Robinhood Chain mainnet fork.
/// FORK_URL=https://rpc.mainnet.chain.robinhood.com forge test --mc ForkTest
contract ForkTest is Test {
    IERC20 constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);

    function test_fork_cycle() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) return;
        vm.createSelectFork(url);
        address owner = makeAddr("owner");
        address prov = makeAddr("prov");
        address holder = makeAddr("holder");
        TallyHub hub = new TallyHub(USDG, owner, owner, owner);
        vm.prank(owner);
        uint256 sid = hub.openSeries(2026, 4);
        deal(address(USDG), prov, 10_000e6);
        deal(address(USDG), holder, 10_000e6);
        assertEq(USDG.balanceOf(prov), 10_000e6);

        vm.startPrank(prov);
        hub.applyProvider(prov, "{}");
        vm.stopPrank();
        vm.prank(owner);
        hub.approveProvider(prov);
        vm.startPrank(prov);
        hub.setProviderConfig(7, 1000, bytes32(uint256(1)));
        USDG.approve(address(hub), 1820e6);
        uint256 lid = hub.list(sid, 1000, 1_400_000);
        vm.stopPrank();

        vm.startPrank(holder);
        USDG.approve(address(hub), 1400e6);
        hub.buy(lid, 1000);
        USDG.approve(address(hub), 1_400_000);
        uint256 rid = hub.redeem(sid, 100, prov, 1, bytes32(0));
        vm.stopPrank();
        assertEq(USDG.balanceOf(owner), 14e6 + 1_400_000);

        skip(30 minutes);
        uint256 before = USDG.balanceOf(holder);
        hub.claimMissedStart(rid);
        assertEq(USDG.balanceOf(holder) - before, 161e6);
        assertEq(USDG.balanceOf(address(hub)), 1820e6 - 161e6);
    }
}
