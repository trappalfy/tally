// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {TallySeries} from "./TallySeries.sol";

/// @title TallyHub
/// @notice Warehouse receipts for GPU compute. 1 receipt = 1 NCU = one hour on the reference A100 80GB.
/// Providers mint receipts against 130% USDG collateral; holders redeem them for compute with a
/// 30-minute start guarantee or settle them in USDG at quarter end.
/// @dev No proxies, no delegatecall. Owner and arbiter can never move collateral or settlement pools
/// except along the paths below.
contract TallyHub is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // Constants (fixed forever)
    // ------------------------------------------------------------------

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;

    uint256 public constant MINT_CR_BPS = 13_000; // 130% at mint
    uint256 public constant MAINT_CR_BPS = 11_500; // 115% maintenance
    uint256 public constant RESERVE_BPS = 11_500; // value + 15% penalty
    uint256 public constant FEE_BPS = 100; // 1% mint (provider), 1% redeem (holder)
    uint256 public constant START_WINDOW = 30 minutes;

    // [ПОДТВЕРДИТЬ] parameters, fixed at deploy
    uint256 public constant DISPUTE_GRACE = 2 hours;
    uint256 public constant DISPUTE_BOND_BPS = 500;
    uint256 public constant ARBITER_DEADLINE = 7 days;
    uint256 public constant TIMELOCK = 7 days;
    uint256 public constant PRICE_BAND_BPS = 2_000; // ±20% of riskRef
    uint256 public constant RISK_SPEED_BPS = 500; // riskRef moves ≤ 5% per day
    uint256 public constant SHARE_CAP_BPS = 4_000; // ≤ 40% weight per provider in ref
    uint256 public constant SHARE_CAP_MIN_SELLERS = 3;
    uint256 public constant MIN_CAPACITY = 100;
    uint256 public constant FLAG_GRACE = 24 hours;
    uint256 public constant LIQ_BONUS_BPS = 500;
    uint256 public constant OPEN_BEFORE = 30 days;
    uint256 public constant LISTINGS_CLOSE_BEFORE = 7 days;

    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    enum Phase {
        Pending,
        Open,
        Closing,
        Ended,
        Finalized
    }

    enum Status {
        None,
        Requested,
        Started,
        Disputed,
        Closed
    }

    enum Outcome {
        None,
        Released,
        MissedStart,
        Resolved,
        StaleDispute
    }

    struct Provider {
        bool applied;
        bool approved;
        bool suspended;
        address payout;
        uint256 gpuMask;
        uint256 maxOpenNcu;
        uint256 openNcu;
        bytes32 pubKey;
    }

    struct GpuType {
        bool exists;
        uint32 ncuPerHourBps;
        string name;
    }

    struct PendingGpu {
        uint64 eta;
        uint32 ncuPerHourBps;
        string name;
    }

    struct Series {
        TallySeries token;
        uint16 year;
        uint8 quarter;
        bool finalized;
        uint64 openAt;
        uint64 startAt;
        uint64 listingsCloseAt;
        uint64 endAt;
        uint64 riskRefAt;
        uint256 totalPaid; // Σ gross primary sale USDG
        uint256 totalSold; // Σ receipts sold
        uint256 refWad; // reference price, USDG units per receipt × 1e18
        uint256 riskRefWad; // smoothed reference price for risk checks
        uint256 sellerCount;
        uint256 openRedemptions;
        uint256 finalizeCursor;
        uint256 pool;
        uint256 shortfall;
        uint256 finalRefWad;
        uint256 payoutPerReceipt;
    }

    struct Position {
        bool registered;
        bool finalized;
        uint64 flaggedAt;
        uint256 escrow; // listing collateral, backs nothing
        uint256 collateral; // backs issued receipts; includes reserved
        uint256 reserved; // part of collateral reserved for open redemptions
        uint256 outstanding;
        uint256 sold;
        uint256 paid;
    }

    struct Listing {
        address provider;
        uint256 series;
        uint256 remaining;
        uint256 price;
        uint256 escrow;
    }

    struct Redemption {
        address holder;
        address provider;
        uint256 series;
        uint256 n;
        uint8 gpuType;
        Status status;
        Outcome outcome;
        uint256 refWad;
        uint256 value;
        uint256 reserve;
        uint256 bond;
        uint64 duration;
        uint64 startBy;
        uint64 startedAt;
        uint64 jobEnd;
        uint64 disputeUntil;
        uint64 disputedAt;
        bytes32 specHash;
        bytes32 startProofHash;
    }

    struct SeriesView {
        uint256 id;
        address token;
        uint16 year;
        uint8 quarter;
        Phase phase;
        uint64 openAt;
        uint64 startAt;
        uint64 listingsCloseAt;
        uint64 endAt;
        uint256 totalPaid;
        uint256 totalSold;
        uint256 totalSupply;
        uint256 refWad;
        uint256 riskRefWad;
        uint256 sellerCount;
        uint256 providerCount;
        uint256 openRedemptions;
        uint256 finalizeCursor;
        uint256 pool;
        uint256 shortfall;
        uint256 finalRefWad;
        uint256 payoutPerReceipt;
    }

    struct Health {
        uint256 escrow;
        uint256 collateral;
        uint256 reserved;
        uint256 free;
        uint256 outstanding;
        uint256 sold;
        uint256 paid;
        uint256 crBps; // type(uint256).max when outstanding == 0
        uint64 flaggedAt;
        bool flagged;
        bool belowMaintenance;
        bool liquidatable;
        bool finalized;
        uint256 withdrawable;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    IERC20 public immutable usdg;

    address public arbiter;
    address public treasury;
    bool public salesPaused;

    address public pendingArbiter;
    uint64 public arbiterEta;
    address public pendingTreasury;
    uint64 public treasuryEta;

    mapping(uint8 => GpuType) internal _gpuTypes;
    mapping(uint8 => PendingGpu) internal _pendingGpu;
    uint8[] internal _gpuTypeIds;

    mapping(address => Provider) internal _providers;
    address[] internal _providerList;

    mapping(uint256 => Series) internal _series;
    uint256[] internal _seriesIds;
    mapping(uint256 => address[]) internal _seriesProviders; // registered positions, for finalization
    mapping(uint256 => address[]) internal _sellers; // providers with sales, for ref
    mapping(address => mapping(uint256 => Position)) internal _positions;

    Listing[] internal _listings;
    Redemption[] internal _redemptions;

    uint256 public totalBonds;
    uint256 public totalOwed;
    mapping(address => uint256) public owed; // payouts that could not be pushed (frozen / paused USDG)

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event ProviderApplied(address indexed provider, address payout, string meta);
    event ProviderApproved(address indexed provider);
    event ProviderSuspended(address indexed provider);
    event ProviderUnsuspended(address indexed provider);
    event ProviderConfigSet(address indexed provider, uint256 gpuMask, uint256 maxOpenNcu, bytes32 pubKey);

    event GpuTypeProposed(uint8 indexed id, uint32 ncuPerHourBps, string name, uint64 eta);
    event GpuTypeAdded(uint8 indexed id, uint32 ncuPerHourBps, string name);
    event ArbiterProposed(address indexed arbiter, uint64 eta);
    event ArbiterChanged(address indexed arbiter);
    event TreasuryProposed(address indexed treasury, uint64 eta);
    event TreasuryChanged(address indexed treasury);
    event SalesPaused();
    event SalesUnpaused();

    event SeriesOpened(uint256 indexed series, address token, uint64 openAt, uint64 startAt, uint64 listingsCloseAt, uint64 endAt);
    event Listed(uint256 indexed listingId, address indexed provider, uint256 indexed series, uint256 n, uint256 price, uint256 escrow);
    event ListingCancelled(uint256 indexed listingId, address indexed by, uint256 remaining, uint256 escrowReturned);
    event Bought(uint256 indexed listingId, address indexed buyer, uint256 n, uint256 price, uint256 fee, uint256 extraCollateral);
    event RefUpdated(uint256 indexed series, uint256 refWad, uint256 riskRefWad);

    event ToppedUp(address indexed provider, uint256 indexed series, uint256 amount);
    event Withdrawn(address indexed provider, uint256 indexed series, uint256 amount);
    event Flagged(address indexed provider, uint256 indexed series, address by);
    event Unflagged(address indexed provider, uint256 indexed series);
    event Liquidated(address indexed provider, uint256 indexed series, address indexed liquidator, uint256 k, uint256 paid);

    event RedemptionRequested(
        uint256 indexed id,
        address indexed holder,
        address indexed provider,
        uint256 series,
        uint256 n,
        uint8 gpuType,
        uint256 refWad,
        uint256 reserve,
        uint64 startBy
    );
    event StartConfirmed(uint256 indexed id, bytes32 startProofHash, uint64 jobEnd, uint64 disputeUntil);
    event MissedStartPaid(uint256 indexed id, uint256 amount);
    event ReserveReleased(uint256 indexed id);
    event Disputed(uint256 indexed id, uint256 bond);
    event DisputeResolved(uint256 indexed id, uint256 holderShareBps);
    event StaleDisputeClosed(uint256 indexed id);

    event ProvidersFinalized(uint256 indexed series, uint256 from, uint256 to, uint256 poolAdded, uint256 shortfallAdded);
    event SeriesFinalized(uint256 indexed series, uint256 finalRefWad, uint256 payoutPerReceipt, uint256 shortfall);
    event Settled(uint256 indexed series, address indexed holder, uint256 n, uint256 amount);

    event PayoutDeferred(address indexed to, uint256 amount);
    event OwedClaimed(address indexed to, uint256 amount);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error ZeroAddress();
    error Disabled();
    error BadInput();
    error UnknownSeries();
    error SeriesExists();
    error WrongPhase();
    error Paused();
    error NotProvider();
    error NotApproved();
    error ProviderSuspendedErr();
    error ProviderFlagged();
    error NotConfigured();
    error CapacityRule();
    error OutOfBand();
    error InsufficientListing();
    error InsufficientCollateral();
    error InsufficientOutstanding();
    error CapacityFull();
    error UnsupportedGpu();
    error UnknownGpu();
    error GpuExists();
    error NotAuthorized();
    error BadStatus();
    error TooEarly();
    error TooLate();
    error NotFlaggable();
    error NotFlagged();
    error NotLiquidatable();
    error TooMuch();
    error RedemptionsOpen();
    error NotFinalizedYet();
    error NothingOwed();

    // ------------------------------------------------------------------
    // Construction & admin
    // ------------------------------------------------------------------

    constructor(IERC20 usdg_, address owner_, address arbiter_, address treasury_) Ownable(owner_) {
        if (address(usdg_) == address(0) || arbiter_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdg = usdg_;
        arbiter = arbiter_;
        treasury = treasury_;
        _addGpu(0, 10_000, "A100 80GB");
        _addGpu(1, 23_000, "H100");
        _addGpu(2, 9_000, "RTX 4090");
    }

    function renounceOwnership() public pure override {
        revert Disabled();
    }

    function approveProvider(address p) external onlyOwner {
        if (!_providers[p].applied) revert NotProvider();
        _providers[p].approved = true;
        emit ProviderApproved(p);
    }

    function suspendProvider(address p) external onlyOwner {
        if (!_providers[p].approved) revert NotApproved();
        _providers[p].suspended = true;
        emit ProviderSuspended(p);
    }

    function unsuspendProvider(address p) external onlyOwner {
        _providers[p].suspended = false;
        emit ProviderUnsuspended(p);
    }

    function pauseSales() external onlyOwner {
        salesPaused = true;
        emit SalesPaused();
    }

    function unpauseSales() external onlyOwner {
        salesPaused = false;
        emit SalesUnpaused();
    }

    function openSeries(uint16 year, uint8 quarter) external onlyOwner returns (uint256 id) {
        if (quarter < 1 || quarter > 4 || year < 2024 || year > 2999) revert BadInput();
        id = uint256(year) * 10 + quarter;
        Series storage s = _series[id];
        if (address(s.token) != address(0)) revert SeriesExists();

        uint64 startAt = uint64(_daysFromCivil(year, uint256(quarter) * 3 - 2) * 1 days);
        uint64 endAt = quarter == 4
            ? uint64(_daysFromCivil(uint256(year) + 1, 1) * 1 days)
            : uint64(_daysFromCivil(year, uint256(quarter) * 3 + 1) * 1 days);

        string memory y = Strings.toString(year);
        string memory q = Strings.toString(quarter);
        uint256 yy = year % 100;
        string memory yy2 = yy < 10 ? string.concat("0", Strings.toString(yy)) : Strings.toString(yy);
        TallySeries token = new TallySeries{salt: bytes32(id)}(
            string.concat("Tally Receipt ", y, "-Q", q), string.concat("NCU-", yy2, "Q", q), id
        );

        s.token = token;
        s.year = year;
        s.quarter = quarter;
        s.startAt = startAt;
        s.endAt = endAt;
        s.openAt = startAt - uint64(OPEN_BEFORE);
        s.listingsCloseAt = endAt - uint64(LISTINGS_CLOSE_BEFORE);
        _seriesIds.push(id);
        emit SeriesOpened(id, address(token), s.openAt, startAt, s.listingsCloseAt, endAt);
    }

    function proposeGpuType(uint8 id, uint32 ncuPerHourBps, string calldata name) external onlyOwner {
        if (_gpuTypes[id].exists) revert GpuExists();
        if (ncuPerHourBps == 0 || bytes(name).length == 0) revert BadInput();
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        _pendingGpu[id] = PendingGpu(eta, ncuPerHourBps, name);
        emit GpuTypeProposed(id, ncuPerHourBps, name, eta);
    }

    function executeGpuType(uint8 id) external onlyOwner {
        PendingGpu memory pg = _pendingGpu[id];
        if (pg.eta == 0) revert BadInput();
        if (block.timestamp < pg.eta) revert TooEarly();
        if (_gpuTypes[id].exists) revert GpuExists();
        delete _pendingGpu[id];
        _addGpu(id, pg.ncuPerHourBps, pg.name);
    }

    function proposeArbiter(address a) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        pendingArbiter = a;
        arbiterEta = uint64(block.timestamp + TIMELOCK);
        emit ArbiterProposed(a, arbiterEta);
    }

    function executeArbiter() external onlyOwner {
        if (pendingArbiter == address(0)) revert BadInput();
        if (block.timestamp < arbiterEta) revert TooEarly();
        arbiter = pendingArbiter;
        pendingArbiter = address(0);
        arbiterEta = 0;
        emit ArbiterChanged(arbiter);
    }

    function proposeTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        pendingTreasury = t;
        treasuryEta = uint64(block.timestamp + TIMELOCK);
        emit TreasuryProposed(t, treasuryEta);
    }

    function executeTreasury() external onlyOwner {
        if (pendingTreasury == address(0)) revert BadInput();
        if (block.timestamp < treasuryEta) revert TooEarly();
        treasury = pendingTreasury;
        pendingTreasury = address(0);
        treasuryEta = 0;
        emit TreasuryChanged(treasury);
    }

    // ------------------------------------------------------------------
    // Providers
    // ------------------------------------------------------------------

    /// @notice Apply as a provider or update the application (meta: JSON with name, site, benchmark, webhook).
    function applyProvider(address payout, string calldata meta) external {
        if (payout == address(0)) revert ZeroAddress();
        Provider storage p = _providers[msg.sender];
        if (!p.applied) {
            p.applied = true;
            _providerList.push(msg.sender);
        }
        p.payout = payout;
        emit ProviderApplied(msg.sender, payout, meta);
    }

    function setProviderConfig(uint256 gpuMask, uint256 maxOpenNcu, bytes32 pubKey) external {
        Provider storage p = _providers[msg.sender];
        if (!p.applied) revert NotProvider();
        for (uint256 i; i < 256; ++i) {
            if (gpuMask >> i == 0) break;
            if ((gpuMask >> i) & 1 == 1 && !_gpuTypes[uint8(i)].exists) revert UnknownGpu();
        }
        uint256 n = _seriesIds.length;
        for (uint256 i; i < n; ++i) {
            uint256 sid = _seriesIds[i];
            Phase ph = _phase(_series[sid]);
            if (ph != Phase.Open && ph != Phase.Closing) continue;
            uint256 out = _positions[msg.sender][sid].outstanding;
            if (out == 0) continue;
            if (gpuMask == 0 || maxOpenNcu < Math.min(out, MIN_CAPACITY)) revert CapacityRule();
        }
        p.gpuMask = gpuMask;
        p.maxOpenNcu = maxOpenNcu;
        p.pubKey = pubKey;
        emit ProviderConfigSet(msg.sender, gpuMask, maxOpenNcu, pubKey);
    }

    // ------------------------------------------------------------------
    // Listings and primary sales
    // ------------------------------------------------------------------

    function list(uint256 sid, uint256 n, uint256 price) external nonReentrant returns (uint256 id) {
        Series storage s = _seriesOf(sid);
        if (_phase(s) != Phase.Open) revert WrongPhase();
        if (salesPaused) revert Paused();
        if (n == 0 || price == 0) revert BadInput();
        Provider storage pr = _providers[msg.sender];
        _requireActive(pr);
        if (pr.gpuMask == 0 || pr.pubKey == bytes32(0)) revert NotConfigured();
        Position storage pos = _positions[msg.sender][sid];
        if (pos.flaggedAt != 0) revert ProviderFlagged();

        _pokeRisk(s);
        _checkBand(s, price);

        uint256 escrow = Math.mulDiv(n * price, MINT_CR_BPS, BPS, Math.Rounding.Ceil);
        usdg.safeTransferFrom(msg.sender, address(this), escrow);

        _register(msg.sender, sid, pos);
        pos.escrow += escrow;
        id = _listings.length;
        _listings.push(Listing(msg.sender, sid, n, price, escrow));
        emit Listed(id, msg.sender, sid, n, price, escrow);
    }

    function cancelListing(uint256 id) external nonReentrant {
        if (id >= _listings.length) revert BadInput();
        Listing storage l = _listings[id];
        Series storage s = _series[l.series];
        Phase ph = _phase(s);
        if (ph == Phase.Finalized) revert WrongPhase();
        if (ph == Phase.Open && msg.sender != l.provider) revert NotAuthorized();
        Position storage pos = _positions[l.provider][l.series];
        if (pos.finalized) revert WrongPhase();
        if (l.remaining == 0 && l.escrow == 0) revert BadStatus();

        uint256 esc = l.escrow;
        uint256 rem = l.remaining;
        l.escrow = 0;
        l.remaining = 0;
        pos.escrow -= esc;
        pos.collateral += esc;
        emit ListingCancelled(id, msg.sender, rem, esc);
    }

    function buy(uint256 listingId, uint256 n) external nonReentrant {
        if (listingId >= _listings.length) revert BadInput();
        Listing storage l = _listings[listingId];
        uint256 sid = l.series;
        Series storage s = _series[sid];
        if (_phase(s) != Phase.Open) revert WrongPhase();
        if (salesPaused) revert Paused();
        if (n == 0) revert BadInput();
        if (n > l.remaining) revert InsufficientListing();

        address prov = l.provider;
        Provider storage pr = _providers[prov];
        _requireActive(pr);
        Position storage pos = _positions[prov][sid];
        if (pos.flaggedAt != 0) revert ProviderFlagged();
        if (pr.gpuMask == 0 || pr.maxOpenNcu < Math.min(pos.outstanding + n, MIN_CAPACITY)) revert CapacityRule();

        _pokeRisk(s);
        uint256 price = l.price;
        _checkBand(s, price);

        // collateral: 130% of n × max(P, ref)
        uint256 move = n == l.remaining ? l.escrow : Math.min(Math.mulDiv(n * price, MINT_CR_BPS, BPS, Math.Rounding.Ceil), l.escrow);
        uint256 extra;
        if (s.totalSold > 0) {
            uint256 reqAtRef = _refAmount(s, n, MINT_CR_BPS, Math.Rounding.Ceil);
            if (reqAtRef > move) {
                extra = reqAtRef - move;
                if (_surplus(s, pos) < extra) revert InsufficientCollateral();
            }
        }
        l.escrow -= move;
        l.remaining -= n;
        pos.escrow -= move;
        pos.collateral += move;

        // money: buyer pays n × P; 1% to treasury, rest to provider payout address
        uint256 cost = n * price;
        uint256 fee = Math.mulDiv(cost, FEE_BPS, BPS);
        usdg.safeTransferFrom(msg.sender, treasury, fee);
        usdg.safeTransferFrom(msg.sender, pr.payout, cost - fee);

        // lazy mint
        s.token.mint(msg.sender, n);
        pos.outstanding += n;
        if (pos.sold == 0) {
            _sellers[sid].push(prov);
            s.sellerCount += 1;
        }
        pos.sold += n;
        pos.paid += cost;
        s.totalSold += n;
        s.totalPaid += cost;
        s.refWad = _computeRef(sid, s);
        if (s.riskRefWad == 0) {
            s.riskRefWad = s.refWad;
            s.riskRefAt = uint64(block.timestamp);
        }
        emit Bought(listingId, msg.sender, n, price, fee, extra);
        emit RefUpdated(sid, s.refWad, s.riskRefWad);
    }

    // ------------------------------------------------------------------
    // Collateral
    // ------------------------------------------------------------------

    function topUp(uint256 sid, uint256 amount) external nonReentrant {
        Series storage s = _seriesOf(sid);
        Phase ph = _phase(s);
        if (ph == Phase.Pending || ph == Phase.Finalized) revert WrongPhase();
        if (amount == 0) revert BadInput();
        Position storage pos = _positions[msg.sender][sid];
        if (!pos.registered) {
            if (!_providers[msg.sender].approved || ph == Phase.Ended) revert NotApproved();
            _register(msg.sender, sid, pos);
        }
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        pos.collateral += amount;
        emit ToppedUp(msg.sender, sid, amount);

        if (pos.flaggedAt != 0 && ph != Phase.Ended) {
            _pokeRisk(s);
            if (!_belowMaint(s, pos)) {
                pos.flaggedAt = 0;
                emit Unflagged(msg.sender, sid);
            }
        }
    }

    function withdraw(uint256 sid, uint256 amount) external nonReentrant {
        Series storage s = _seriesOf(sid);
        Phase ph = _phase(s);
        Position storage pos = _positions[msg.sender][sid];
        if (amount == 0) revert BadInput();
        if (ph == Phase.Open || ph == Phase.Closing) {
            _pokeRisk(s);
            if (amount > _surplus(s, pos)) revert TooMuch();
        } else if (ph == Phase.Finalized) {
            if (amount > pos.collateral - pos.reserved) revert TooMuch();
        } else {
            revert WrongPhase();
        }
        pos.collateral -= amount;
        usdg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, sid, amount);
    }

    function flag(address provider, uint256 sid) external {
        Series storage s = _seriesOf(sid);
        _requireActivePhase(s);
        Position storage pos = _positions[provider][sid];
        if (pos.flaggedAt != 0) revert NotFlaggable();
        _pokeRisk(s);
        if (!_belowMaint(s, pos)) revert NotFlaggable();
        pos.flaggedAt = uint64(block.timestamp);
        emit Flagged(provider, sid, msg.sender);
    }

    function unflag(address provider, uint256 sid) external {
        Series storage s = _seriesOf(sid);
        _requireActivePhase(s);
        Position storage pos = _positions[provider][sid];
        if (pos.flaggedAt == 0) revert NotFlagged();
        _pokeRisk(s);
        if (_belowMaint(s, pos)) revert NotFlaggable();
        pos.flaggedAt = 0;
        emit Unflagged(provider, sid);
    }

    /// @notice Burn k receipts of this series and take k × riskRef × 1.05 from the provider's free collateral.
    function liquidate(address provider, uint256 sid, uint256 k) external nonReentrant {
        Series storage s = _seriesOf(sid);
        _requireActivePhase(s);
        Position storage pos = _positions[provider][sid];
        if (pos.flaggedAt == 0 || block.timestamp < uint256(pos.flaggedAt) + FLAG_GRACE) revert NotLiquidatable();
        _pokeRisk(s);
        if (!_belowMaint(s, pos)) revert NotLiquidatable();
        (uint256 kMax,) = _liqQuote(s, pos, 0);
        if (k == 0 || k > kMax) revert TooMuch();
        (, uint256 paid) = _liqQuote(s, pos, k);

        s.token.burn(msg.sender, k);
        pos.outstanding -= k;
        pos.collateral -= paid;
        usdg.safeTransfer(msg.sender, paid);
        emit Liquidated(provider, sid, msg.sender, k, paid);
    }

    // ------------------------------------------------------------------
    // Redemption
    // ------------------------------------------------------------------

    function redeem(uint256 sid, uint256 n, address provider, uint8 gpu, bytes32 specHash)
        external
        nonReentrant
        returns (uint256 id)
    {
        Series storage s = _seriesOf(sid);
        _requireActivePhase(s);
        if (n == 0) revert BadInput();
        Provider storage pr = _providers[provider];
        _requireActive(pr);
        if ((pr.gpuMask >> gpu) & 1 == 0) revert UnsupportedGpu();
        GpuType storage g = _gpuTypes[gpu];
        if (!g.exists) revert UnknownGpu();
        Position storage pos = _positions[provider][sid];
        if (pos.outstanding < n) revert InsufficientOutstanding();
        if (pr.openNcu + n > pr.maxOpenNcu) revert CapacityFull();

        _pokeRisk(s);
        uint256 value = _refAmount(s, n, BPS, Math.Rounding.Floor);
        uint256 fee = _refAmount(s, n, FEE_BPS, Math.Rounding.Floor);
        uint256 reserve = _refAmount(s, n, RESERVE_BPS, Math.Rounding.Ceil);
        if (pos.collateral - pos.reserved < reserve) revert InsufficientCollateral();

        s.token.burn(msg.sender, n);
        if (fee > 0) usdg.safeTransferFrom(msg.sender, treasury, fee);

        pos.outstanding -= n;
        pos.reserved += reserve;
        pr.openNcu += n;
        s.openRedemptions += 1;

        uint64 startBy = uint64(block.timestamp + START_WINDOW);
        id = _redemptions.length;
        Redemption storage r = _redemptions.push();
        r.holder = msg.sender;
        r.provider = provider;
        r.series = sid;
        r.n = n;
        r.gpuType = gpu;
        r.status = Status.Requested;
        r.refWad = s.refWad;
        r.value = value;
        r.reserve = reserve;
        r.duration = uint64((n * BPS * 1 hours) / g.ncuPerHourBps);
        r.startBy = startBy;
        r.specHash = specHash;
        emit RedemptionRequested(id, msg.sender, provider, sid, n, gpu, s.refWad, reserve, startBy);
    }

    function confirmStart(uint256 id, bytes32 startProofHash) external {
        Redemption storage r = _redemptionOf(id);
        if (msg.sender != r.provider) revert NotAuthorized();
        if (r.status != Status.Requested) revert BadStatus();
        if (block.timestamp >= r.startBy) revert TooLate();
        uint64 now_ = uint64(block.timestamp);
        r.status = Status.Started;
        r.startedAt = now_;
        r.jobEnd = now_ + r.duration;
        r.disputeUntil = r.jobEnd + uint64(DISPUTE_GRACE);
        r.startProofHash = startProofHash;
        emit StartConfirmed(id, startProofHash, r.jobEnd, r.disputeUntil);
    }

    /// @notice Anyone, once startBy has passed without a confirmed start: the holder gets the full reserve.
    function claimMissedStart(uint256 id) external nonReentrant {
        Redemption storage r = _redemptionOf(id);
        if (r.status != Status.Requested) revert BadStatus();
        if (block.timestamp < r.startBy) revert TooEarly();
        Position storage pos = _positions[r.provider][r.series];
        uint256 amount = r.reserve;
        pos.reserved -= amount;
        pos.collateral -= amount;
        _close(r, Outcome.MissedStart);
        _payOrCredit(r.holder, amount);
        emit MissedStartPaid(id, amount);
    }

    function releaseReserve(uint256 id) external {
        Redemption storage r = _redemptionOf(id);
        if (r.status != Status.Started) revert BadStatus();
        if (block.timestamp <= r.disputeUntil) revert TooEarly();
        _positions[r.provider][r.series].reserved -= r.reserve;
        _close(r, Outcome.Released);
        emit ReserveReleased(id);
    }

    function dispute(uint256 id) external nonReentrant {
        Redemption storage r = _redemptionOf(id);
        if (msg.sender != r.holder) revert NotAuthorized();
        if (r.status != Status.Started) revert BadStatus();
        if (block.timestamp > r.disputeUntil) revert TooLate();
        uint256 bond = Math.mulDiv(r.value, DISPUTE_BOND_BPS, BPS, Math.Rounding.Ceil);
        if (bond > 0) usdg.safeTransferFrom(msg.sender, address(this), bond);
        r.bond = bond;
        r.status = Status.Disputed;
        r.disputedAt = uint64(block.timestamp);
        totalBonds += bond;
        emit Disputed(id, bond);
    }

    function resolve(uint256 id, uint256 holderShareBps) external nonReentrant {
        if (msg.sender != arbiter) revert NotAuthorized();
        Redemption storage r = _redemptionOf(id);
        if (r.status != Status.Disputed) revert BadStatus();
        if (block.timestamp > uint256(r.disputedAt) + ARBITER_DEADLINE) revert TooLate();
        if (holderShareBps > BPS) revert BadInput();

        Position storage pos = _positions[r.provider][r.series];
        uint256 toHolder = Math.mulDiv(r.reserve, holderShareBps, BPS);
        uint256 bond = r.bond;
        pos.reserved -= r.reserve;
        pos.collateral -= toHolder;
        totalBonds -= bond;
        if (holderShareBps > 0) {
            toHolder += bond;
        } else {
            pos.collateral += bond;
        }
        _close(r, Outcome.Resolved);
        if (toHolder > 0) _payOrCredit(r.holder, toHolder);
        emit DisputeResolved(id, holderShareBps);
    }

    function closeStaleDispute(uint256 id) external nonReentrant {
        Redemption storage r = _redemptionOf(id);
        if (r.status != Status.Disputed) revert BadStatus();
        if (block.timestamp <= uint256(r.disputedAt) + ARBITER_DEADLINE) revert TooEarly();
        Position storage pos = _positions[r.provider][r.series];
        uint256 reserve = r.reserve;
        uint256 bond = r.bond;
        pos.reserved -= reserve;
        pos.collateral -= reserve;
        totalBonds -= bond;
        _close(r, Outcome.StaleDispute);
        _payOrCredit(r.holder, reserve + bond);
        emit StaleDisputeClosed(id);
    }

    /// @notice Pull a payout that could not be pushed earlier (e.g. USDG was paused).
    function claimOwed() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        usdg.safeTransfer(msg.sender, amount);
        emit OwedClaimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Quarter end
    // ------------------------------------------------------------------

    function finalizeProviders(uint256 sid, uint256 maxCount) external nonReentrant {
        Series storage s = _seriesOf(sid);
        if (_phase(s) != Phase.Ended) revert WrongPhase();
        if (s.openRedemptions != 0) revert RedemptionsOpen();
        address[] storage list_ = _seriesProviders[sid];
        uint256 from = s.finalizeCursor;
        uint256 to = Math.min(list_.length, from + maxCount);
        uint256 poolAdded;
        uint256 shortAdded;
        for (uint256 i = from; i < to; ++i) {
            Position storage pos = _positions[list_[i]][sid];
            pos.collateral += pos.escrow;
            pos.escrow = 0;
            if (pos.outstanding > 0) {
                uint256 owedValue = _refAmount(s, pos.outstanding, BPS, Math.Rounding.Ceil);
                uint256 free = pos.collateral - pos.reserved;
                uint256 toPool = Math.min(owedValue, free);
                pos.collateral -= toPool;
                poolAdded += toPool;
                shortAdded += owedValue - toPool;
            }
            pos.finalized = true;
        }
        s.finalizeCursor = to;
        s.pool += poolAdded;
        s.shortfall += shortAdded;
        emit ProvidersFinalized(sid, from, to, poolAdded, shortAdded);
    }

    function completeFinalization(uint256 sid) external {
        Series storage s = _seriesOf(sid);
        if (_phase(s) != Phase.Ended) revert WrongPhase();
        if (s.openRedemptions != 0) revert RedemptionsOpen();
        if (s.finalizeCursor != _seriesProviders[sid].length) revert NotFinalizedYet();
        s.finalRefWad = s.refWad;
        uint256 supply = s.token.totalSupply();
        uint256 ppr;
        if (supply > 0) {
            ppr = Math.min(_refAmount(s, 1, BPS, Math.Rounding.Floor), s.pool / supply);
        }
        s.payoutPerReceipt = ppr;
        s.finalized = true;
        emit SeriesFinalized(sid, s.finalRefWad, ppr, s.shortfall);
    }

    /// @notice Burn receipts after finalization and take amount × payoutPerReceipt USDG. No fee, no deadline.
    function settle(uint256 sid, uint256 amount) external nonReentrant {
        Series storage s = _seriesOf(sid);
        if (!s.finalized) revert WrongPhase();
        if (amount == 0) revert BadInput();
        uint256 pay = amount * s.payoutPerReceipt;
        s.token.burn(msg.sender, amount);
        s.pool -= pay;
        if (pay > 0) usdg.safeTransfer(msg.sender, pay);
        emit Settled(sid, msg.sender, amount, pay);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function ref(uint256 sid) external view returns (uint256) {
        return _seriesOf(sid).refWad;
    }

    function riskRef(uint256 sid) external view returns (uint256) {
        return _viewRisk(_seriesOf(sid));
    }

    function phase(uint256 sid) external view returns (Phase) {
        return _phase(_seriesOf(sid));
    }

    function seriesInfo(uint256 sid) public view returns (SeriesView memory v) {
        Series storage s = _seriesOf(sid);
        v.id = sid;
        v.token = address(s.token);
        v.year = s.year;
        v.quarter = s.quarter;
        v.phase = _phase(s);
        v.openAt = s.openAt;
        v.startAt = s.startAt;
        v.listingsCloseAt = s.listingsCloseAt;
        v.endAt = s.endAt;
        v.totalPaid = s.totalPaid;
        v.totalSold = s.totalSold;
        v.totalSupply = s.token.totalSupply();
        v.refWad = s.refWad;
        v.riskRefWad = _viewRisk(s);
        v.sellerCount = s.sellerCount;
        v.providerCount = _seriesProviders[sid].length;
        v.openRedemptions = s.openRedemptions;
        v.finalizeCursor = s.finalizeCursor;
        v.pool = s.pool;
        v.shortfall = s.shortfall;
        v.finalRefWad = s.finalRefWad;
        v.payoutPerReceipt = s.payoutPerReceipt;
    }

    function allSeries() external view returns (uint256[] memory) {
        return _seriesIds;
    }

    function seriesProviders(uint256 sid) external view returns (address[] memory) {
        return _seriesProviders[sid];
    }

    function providers() external view returns (address[] memory) {
        return _providerList;
    }

    function getProvider(address p) external view returns (Provider memory) {
        return _providers[p];
    }

    function getPosition(address p, uint256 sid) external view returns (Position memory) {
        return _positions[p][sid];
    }

    function providerHealth(address p, uint256 sid) external view returns (Health memory h) {
        Series storage s = _seriesOf(sid);
        Position storage pos = _positions[p][sid];
        uint256 r = _viewRisk(s);
        h.escrow = pos.escrow;
        h.collateral = pos.collateral;
        h.reserved = pos.reserved;
        h.free = pos.collateral - pos.reserved;
        h.outstanding = pos.outstanding;
        h.sold = pos.sold;
        h.paid = pos.paid;
        h.crBps = (pos.outstanding == 0 || r == 0)
            ? type(uint256).max
            : Math.mulDiv(h.free * BPS, WAD, pos.outstanding * r);
        h.flaggedAt = pos.flaggedAt;
        h.flagged = pos.flaggedAt != 0;
        h.belowMaintenance = _belowMaintAt(pos, r);
        Phase ph = _phase(s);
        bool active = ph == Phase.Open || ph == Phase.Closing;
        h.liquidatable = active && h.flagged && h.belowMaintenance && block.timestamp >= uint256(pos.flaggedAt) + FLAG_GRACE;
        h.finalized = pos.finalized;
        if (active) {
            uint256 req = Math.mulDiv(pos.outstanding * r, MINT_CR_BPS, BPS * WAD, Math.Rounding.Ceil);
            h.withdrawable = h.free > req ? h.free - req : 0;
        } else if (ph == Phase.Finalized) {
            h.withdrawable = h.free;
        }
    }

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function listing(uint256 id) external view returns (Listing memory) {
        return _listings[id];
    }

    function redemptionCount() external view returns (uint256) {
        return _redemptions.length;
    }

    function redemption(uint256 id) external view returns (Redemption memory) {
        return _redemptions[id];
    }

    function gpuTypeIds() external view returns (uint8[] memory) {
        return _gpuTypeIds;
    }

    function getGpuType(uint8 id) external view returns (GpuType memory) {
        return _gpuTypes[id];
    }

    function pendingGpuType(uint8 id) external view returns (PendingGpu memory) {
        return _pendingGpu[id];
    }

    /// @return value n × ref, fee 1% of it, reserve 115% of it, duration in seconds on gpuType
    function quoteRedeem(uint256 sid, uint256 n, uint8 gpuType_)
        external
        view
        returns (uint256 value, uint256 fee, uint256 reserve, uint256 duration)
    {
        Series storage s = _seriesOf(sid);
        GpuType storage g = _gpuTypes[gpuType_];
        if (!g.exists) revert UnknownGpu();
        if (s.totalSold > 0) {
            value = _refAmount(s, n, BPS, Math.Rounding.Floor);
            fee = _refAmount(s, n, FEE_BPS, Math.Rounding.Floor);
            reserve = _refAmount(s, n, RESERVE_BPS, Math.Rounding.Ceil);
        }
        duration = (n * BPS * 1 hours) / g.ncuPerHourBps;
    }

    function quoteLiquidation(address p, uint256 sid)
        external
        view
        returns (bool liquidatable, uint256 kMax, uint256 payoutAtKMax)
    {
        Series storage s = _seriesOf(sid);
        Position storage pos = _positions[p][sid];
        uint256 r = _viewRisk(s);
        Phase ph = _phase(s);
        liquidatable = (ph == Phase.Open || ph == Phase.Closing) && pos.flaggedAt != 0
            && block.timestamp >= uint256(pos.flaggedAt) + FLAG_GRACE && _belowMaintAt(pos, r);
        if (pos.outstanding == 0 || r == 0) return (liquidatable, 0, 0);
        (kMax,) = _liqQuoteAt(pos, r, 0);
        (, payoutAtKMax) = _liqQuoteAt(pos, r, kMax);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _addGpu(uint8 id, uint32 bps, string memory name) internal {
        _gpuTypes[id] = GpuType(true, bps, name);
        _gpuTypeIds.push(id);
        emit GpuTypeAdded(id, bps, name);
    }

    function _seriesOf(uint256 sid) internal view returns (Series storage s) {
        s = _series[sid];
        if (address(s.token) == address(0)) revert UnknownSeries();
    }

    function _redemptionOf(uint256 id) internal view returns (Redemption storage) {
        if (id >= _redemptions.length) revert BadInput();
        return _redemptions[id];
    }

    function _phase(Series storage s) internal view returns (Phase) {
        if (s.finalized) return Phase.Finalized;
        if (block.timestamp >= s.endAt) return Phase.Ended;
        if (block.timestamp >= s.listingsCloseAt) return Phase.Closing;
        if (block.timestamp >= s.openAt) return Phase.Open;
        return Phase.Pending;
    }

    function _requireActivePhase(Series storage s) internal view {
        Phase ph = _phase(s);
        if (ph != Phase.Open && ph != Phase.Closing) revert WrongPhase();
    }

    function _requireActive(Provider storage pr) internal view {
        if (!pr.approved) revert NotApproved();
        if (pr.suspended) revert ProviderSuspendedErr();
    }

    function _register(address p, uint256 sid, Position storage pos) internal {
        if (!pos.registered) {
            pos.registered = true;
            _seriesProviders[sid].push(p);
        }
    }

    function _checkBand(Series storage s, uint256 price) internal view {
        uint256 r = s.riskRefWad;
        if (r == 0) return;
        uint256 p = price * WAD * BPS;
        if (p < r * (BPS - PRICE_BAND_BPS) || p > r * (BPS + PRICE_BAND_BPS)) revert OutOfBand();
    }

    /// @dev n × ref × bps / BPS. Below three sellers ref = Σpaid / Σsold exactly; otherwise the capped refWad.
    function _refAmount(Series storage s, uint256 n, uint256 bps, Math.Rounding rnd) internal view returns (uint256) {
        if (s.totalSold == 0) return 0;
        if (s.sellerCount < SHARE_CAP_MIN_SELLERS) return Math.mulDiv(n * s.totalPaid, bps, s.totalSold * BPS, rnd);
        return Math.mulDiv(n * s.refWad, bps, WAD * BPS, rnd);
    }

    function _computeRef(uint256 sid, Series storage s) internal view returns (uint256) {
        if (s.totalSold == 0) return 0;
        if (s.sellerCount < SHARE_CAP_MIN_SELLERS) return Math.mulDiv(s.totalPaid, WAD, s.totalSold);
        address[] storage sellers = _sellers[sid];
        uint256 cap = SHARE_CAP_BPS * WAD / BPS;
        uint256 sumW;
        uint256 sumWV;
        for (uint256 i; i < sellers.length; ++i) {
            Position storage pos = _positions[sellers[i]][sid];
            uint256 w = Math.min(Math.mulDiv(pos.sold, WAD, s.totalSold), cap);
            sumW += w;
            sumWV += Math.mulDiv(w, pos.paid, pos.sold);
        }
        return Math.mulDiv(sumWV, WAD, sumW);
    }

    function _viewRisk(Series storage s) internal view returns (uint256) {
        uint256 last = s.riskRefWad;
        if (last == 0) return 0;
        uint256 dt = block.timestamp - s.riskRefAt;
        uint256 target = s.refWad;
        if (dt == 0 || target == last) return last;
        uint256 maxMove = Math.mulDiv(last, RISK_SPEED_BPS * dt, BPS * 1 days);
        if (target > last) return Math.min(target, last + maxMove);
        return maxMove >= last ? target : Math.max(target, last - maxMove);
    }

    function _pokeRisk(Series storage s) internal {
        if (s.riskRefWad == 0) return;
        uint256 r = _viewRisk(s);
        s.riskRefWad = r;
        s.riskRefAt = uint64(block.timestamp);
    }

    function _belowMaint(Series storage s, Position storage pos) internal view returns (bool) {
        return _belowMaintAt(pos, s.riskRefWad);
    }

    /// @dev CR = free / (outstanding × riskRef) < 115%
    function _belowMaintAt(Position storage pos, uint256 r) internal view returns (bool) {
        if (pos.outstanding == 0 || r == 0) return false;
        return (pos.collateral - pos.reserved) * BPS * WAD < MAINT_CR_BPS * pos.outstanding * r;
    }

    /// @dev Free collateral above 130% of outstanding at riskRef.
    function _surplus(Series storage s, Position storage pos) internal view returns (uint256) {
        uint256 free = pos.collateral - pos.reserved;
        uint256 req = Math.mulDiv(pos.outstanding * s.riskRefWad, MINT_CR_BPS, BPS * WAD, Math.Rounding.Ceil);
        return free > req ? free - req : 0;
    }

    function _liqQuote(Series storage s, Position storage pos, uint256 k) internal view returns (uint256, uint256) {
        return _liqQuoteAt(pos, s.riskRefWad, k);
    }

    /// @return kMax receipts that bring CR back to 130% (or all when free ≤ 1.05 × O × r)
    /// @return paid payout for k receipts
    function _liqQuoteAt(Position storage pos, uint256 r, uint256 k) internal view returns (uint256 kMax, uint256 paid) {
        uint256 o = pos.outstanding;
        uint256 free = pos.collateral - pos.reserved;
        bool full = free * BPS * WAD <= (BPS + LIQ_BONUS_BPS) * o * r;
        if (full) {
            kMax = o;
            paid = o == 0 ? 0 : Math.mulDiv(free, k, o);
        } else {
            uint256 num = MINT_CR_BPS * o * r;
            uint256 have = free * BPS * WAD;
            kMax = num > have ? Math.ceilDiv(num - have, (MINT_CR_BPS - BPS - LIQ_BONUS_BPS) * r) : 0;
            if (kMax > o) kMax = o;
            paid = Math.min(Math.mulDiv(k * r, BPS + LIQ_BONUS_BPS, BPS * WAD), free);
        }
    }

    function _close(Redemption storage r, Outcome outcome) internal {
        r.status = Status.Closed;
        r.outcome = outcome;
        _providers[r.provider].openNcu -= r.n;
        _series[r.series].openRedemptions -= 1;
    }

    /// @dev Push USDG to a holder; if the transfer fails (paused token, frozen address) record it for claimOwed,
    /// so a redemption can always close and quarter-end finalization can never be blocked.
    function _payOrCredit(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(usdg).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (ok && (ret.length == 0 ? address(usdg).code.length > 0 : (ret.length >= 32 && abi.decode(ret, (bool))))) {
            return;
        }
        owed[to] += amount;
        totalOwed += amount;
        emit PayoutDeferred(to, amount);
    }

    /// @dev Days since 1970-01-01 for the first day of (year, month). Howard Hinnant's days_from_civil.
    function _daysFromCivil(uint256 year, uint256 month) internal pure returns (uint256) {
        uint256 y = month <= 2 ? year - 1 : year;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 mp = month > 2 ? month - 3 : month + 9;
        uint256 doy = (153 * mp + 2) / 5;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }
}
