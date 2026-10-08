// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TallyHub} from "../src/TallyHub.sol";
import {TallySeries} from "../src/TallySeries.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

abstract contract Base is Test {
    TallyHub hub;
    MockUSDG usdg;
    TallySeries q4;

    address owner = makeAddr("owner");
    address arbiter = makeAddr("arbiter");
    address treasury = makeAddr("treasury");
    address provA = makeAddr("provA");
    address provB = makeAddr("provB");
    address provC = makeAddr("provC");
    address payA = makeAddr("payA");
    address payB = makeAddr("payB");
    address payC = makeAddr("payC");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address keeper = makeAddr("keeper");

    uint256 constant Q4 = 20264;
    uint256 constant D = 1e6; // $1
    uint64 constant Q4_START = 1790812800; // 2026-10-01T00:00:00Z
    uint64 constant Q4_END = 1798761600; // 2027-01-01T00:00:00Z
    uint8 constant A100 = 0;
    uint8 constant H100 = 1;
    uint8 constant RTX4090 = 2;

    function setUp() public virtual {
        vm.warp(Q4_START + 7 days);
        usdg = new MockUSDG();
        hub = new TallyHub(usdg, owner, arbiter, treasury);
        vm.prank(owner);
        hub.openSeries(2026, 4);
        q4 = TallySeries(hub.seriesInfo(Q4).token);

        _onboard(provA, payA);
        _onboard(provB, payB);
        _onboard(provC, payC);
        address[5] memory users = [alice, bob, keeper, provA, provB];
        for (uint256 i; i < users.length; ++i) {
            usdg.mint(users[i], 1_000_000 * D);
            vm.prank(users[i]);
            usdg.approve(address(hub), type(uint256).max);
        }
        usdg.mint(provC, 1_000_000 * D);
        vm.prank(provC);
        usdg.approve(address(hub), type(uint256).max);
    }

    function _onboard(address p, address payout) internal {
        vm.prank(p);
        hub.applyProvider(payout, '{"name":"test"}');
        vm.prank(owner);
        hub.approveProvider(p);
        vm.prank(p);
        hub.setProviderConfig(7, 10_000, bytes32(uint256(1)));
    }

    function _list(address p, uint256 n, uint256 price) internal returns (uint256 id) {
        vm.prank(p);
        id = hub.list(Q4, n, price);
    }

    function _buy(address who, uint256 id, uint256 n) internal {
        vm.prank(who);
        hub.buy(id, n);
    }

    function _redeem(address who, uint256 n, address p, uint8 gpu) internal returns (uint256 id) {
        vm.prank(who);
        id = hub.redeem(Q4, n, p, gpu, keccak256("spec"));
    }

    function _health(address p) internal view returns (TallyHub.Health memory) {
        return hub.providerHealth(p, Q4);
    }

    /// @dev Walk riskRef toward ref by poking once a day.
    function _converge(uint256 days_) internal {
        for (uint256 i; i < days_; ++i) {
            skip(1 days);
            vm.prank(provB);
            hub.topUp(Q4, 1);
        }
    }
}
