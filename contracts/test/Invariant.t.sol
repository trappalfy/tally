// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {TallyHub} from "../src/TallyHub.sol";
import {TallySeries} from "../src/TallySeries.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract Handler is Test {
    TallyHub hub;
    MockUSDG usdg;
    TallySeries token;
    address arbiter;
    uint256 constant SID = 20264;
    address[3] public provs;
    address[3] public users;

    constructor(TallyHub hub_, MockUSDG usdg_, address arbiter_, address[3] memory provs_, address[3] memory users_) {
        hub = hub_;
        usdg = usdg_;
        arbiter = arbiter_;
        provs = provs_;
        users = users_;
        token = TallySeries(hub.seriesInfo(SID).token);
    }

    function list(uint256 p, uint256 n, uint256 price) external {
        address pr = provs[p % 3];
        n = bound(n, 1, 500);
        uint256 r = hub.riskRef(SID);
        price = r == 0 ? bound(price, 500_000, 3_000_000) : bound(price, r * 8 / 10 / 1e18 + 1, r * 12 / 10 / 1e18);
        vm.prank(pr);
        try hub.list(SID, n, price) {} catch {}
    }

    function buy(uint256 u, uint256 id, uint256 n) external {
        uint256 c = hub.listingCount();
        if (c == 0) return;
        id = id % c;
        uint256 rem = hub.listing(id).remaining;
        if (rem == 0) return;
        n = bound(n, 1, rem);
        vm.prank(users[u % 3]);
        try hub.buy(id, n) {} catch {}
    }

    function cancel(uint256 id) external {
        uint256 c = hub.listingCount();
        if (c == 0) return;
        id = id % c;
        vm.prank(hub.listing(id).provider);
        try hub.cancelListing(id) {} catch {}
    }

    function redeem(uint256 u, uint256 p, uint256 n, uint8 gpu) external {
        address who = users[u % 3];
        uint256 bal = token.balanceOf(who);
        if (bal == 0) return;
        n = bound(n, 1, bal);
        vm.prank(who);
        try hub.redeem(SID, n, provs[p % 3], gpu % 3, bytes32(0)) {} catch {}
    }

    function confirm(uint256 id) external {
        uint256 c = hub.redemptionCount();
        if (c == 0) return;
        id = id % c;
        vm.prank(hub.redemption(id).provider);
        try hub.confirmStart(id, bytes32(0)) {} catch {}
    }

    function anyoneClose(uint256 id, uint256 which) external {
        uint256 c = hub.redemptionCount();
        if (c == 0) return;
        id = id % c;
        which = which % 3;
        if (which == 0) try hub.claimMissedStart(id) {} catch {}
        else if (which == 1) try hub.releaseReserve(id) {} catch {}
        else try hub.closeStaleDispute(id) {} catch {}
    }

    function disputeAndResolve(uint256 id, uint256 share, bool resolveNow) external {
        uint256 c = hub.redemptionCount();
        if (c == 0) return;
        id = id % c;
        vm.prank(hub.redemption(id).holder);
        try hub.dispute(id) {} catch {}
        if (resolveNow) {
            vm.prank(arbiter);
            try hub.resolve(id, bound(share, 0, 10_000)) {} catch {}
        }
    }

    function topUp(uint256 p, uint256 amt) external {
        vm.prank(provs[p % 3]);
        try hub.topUp(SID, bound(amt, 1, 2_000e6)) {} catch {}
    }

    function withdraw(uint256 p, uint256 amt) external {
        address pr = provs[p % 3];
        uint256 w = hub.providerHealth(pr, SID).withdrawable;
        if (w == 0) return;
        vm.prank(pr);
        try hub.withdraw(SID, bound(amt, 1, w)) {} catch {}
    }

    function flagLiquidate(uint256 p, uint256 u, uint256 k) external {
        address pr = provs[p % 3];
        try hub.flag(pr, SID) {} catch {}
        (bool ok, uint256 kMax,) = hub.quoteLiquidation(pr, SID);
        address who = users[u % 3];
        uint256 bal = token.balanceOf(who);
        if (!ok || kMax == 0 || bal == 0) return;
        k = bound(k, 1, kMax < bal ? kMax : bal);
        vm.prank(who);
        try hub.liquidate(pr, SID, k) {} catch {}
    }

    function warp(uint256 dt) external {
        skip(bound(dt, 1, 3 days));
    }
}

contract InvariantTest is Test {
    TallyHub hub;
    MockUSDG usdg;
    Handler handler;
    address arbiter = makeAddr("arbiter");
    address[3] provs = [makeAddr("p0"), makeAddr("p1"), makeAddr("p2")];
    address[3] users = [makeAddr("u0"), makeAddr("u1"), makeAddr("u2")];
    uint256 constant SID = 20264;

    function setUp() public {
        vm.warp(1790812800 + 1 days);
        usdg = new MockUSDG();
        hub = new TallyHub(usdg, address(this), arbiter, makeAddr("treasury"));
        hub.openSeries(2026, 4);
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(provs[i]);
            hub.applyProvider(provs[i], "{}");
            vm.stopPrank();
            hub.approveProvider(provs[i]);
            vm.startPrank(provs[i]);
            hub.setProviderConfig(7, 1_000, bytes32(uint256(1)));
            usdg.approve(address(hub), type(uint256).max);
            vm.stopPrank();
            usdg.mint(provs[i], 10_000_000e6);
            usdg.mint(users[i], 10_000_000e6);
            vm.prank(users[i]);
            usdg.approve(address(hub), type(uint256).max);
        }
        handler = new Handler(hub, usdg, arbiter, provs, users);
        targetContract(address(handler));
    }

    function invariant_solvency() public view {
        uint256 sum;
        uint256 outstanding;
        for (uint256 i; i < 3; ++i) {
            TallyHub.Position memory p = hub.getPosition(provs[i], SID);
            assertLe(p.reserved, p.collateral);
            sum += p.collateral + p.escrow;
            outstanding += p.outstanding;
        }
        TallyHub.SeriesView memory v = hub.seriesInfo(SID);
        sum += v.pool + hub.totalBonds() + hub.totalOwed();
        assertEq(usdg.balanceOf(address(hub)), sum, "usdg accounting");
        if (v.phase != TallyHub.Phase.Finalized) assertEq(v.totalSupply, outstanding, "supply == outstanding");
    }
}

contract InvariantActivity is InvariantTest {
    function afterInvariant() public view {
        console.log("listings", hub.listingCount(), "redemptions", hub.redemptionCount());
        console.log("supply", hub.seriesInfo(SID).totalSupply);
    }

    function invariant_noop() public pure {}
}
