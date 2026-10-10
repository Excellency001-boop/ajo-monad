// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Ajo — rotating savings circles where trust is liquidity
/// @notice An ajo (esusu, susu, chama, tanda…) is a group that pays a fixed amount every round; each
///         round one member collects the whole pot, until everyone has collected once.
///
///         The hard problem is not the collector running away (a contract fixes that trivially). It is
///         the member who collects early and then stops paying. Collecting early IS borrowing from the
///         group, so this contract treats it like credit:
///
///         1. TRUST = LIQUIDITY. When it is your turn, the pot is split in two:
///              upfront  = what is backed by your own stake + what other people have vouched for you
///              reserve  = the part of your remaining contributions nobody has backed
///            The reserve pays your future contributions automatically. Get vouched for (or add stake)
///            and the reserve unlocks immediately. Fully backed members collect the full pot.
///
///         2. A CIRCLE NEVER FREEZES. After a round's deadline anyone can close it. A missing payment is
///            covered, in order, from: the member's reserve → their own stake → the people who vouched
///            for them (pro-rata) → and, only for a member who has not collected yet, a debt that is
///            repaid out of their own pot when their turn comes.
///
///         3. REPUTATION THAT COSTS SOMETHING. Every payment, miss, completed circle and honoured vouch
///            is recorded per address, weighted by real money, across all circles.
///
/// @dev Single deployment holds many circles. One stablecoin per deployment so amounts are comparable
///      for reputation. Payouts are pushed; if a push fails (e.g. a blocklisted address) the amount is
///      credited to `claimable` instead so no circle can be blocked by one recipient.
contract Ajo is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Config ──────────────────────────────────────────────────────────────

    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 20;
    uint256 public constant MAX_VOUCHERS = 10; // per member per circle; bounds the slashing loop
    uint256 public constant MIN_ROUND_DURATION = 1 minutes;
    uint256 public constant MAX_ROUND_DURATION = 90 days;

    IERC20 public immutable token;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum Status {
        Open, // gathering members
        Active, // rounds running
        Completed, // everyone has collected; stakes, reserves and vouches claimable
        Cancelled // organizer cancelled before start; stakes and vouches claimable
    }

    struct Circle {
        address organizer;
        uint40 roundDuration;
        uint40 roundStart;
        uint8 size; // number of members = number of rounds
        uint8 currentRound;
        Status status;
        uint128 contribution; // paid by every member every round
        uint128 minStake; // locked by every member on join
        string name;
    }

    struct Member {
        bool joined;
        bool received; // has collected their pot
        bool defaulted; // missed at least one payment that had to be covered by stake/vouchers/debt
        bool settled; // has claimed their stake + reserve after the circle ended
        uint8 slot; // round in which this member collects
        uint128 stake; // own stake still locked
        uint128 vouched; // vouches still backing this member
        uint128 reserve; // held-back pot that pays this member's future contributions
        uint128 debt; // shortfall this member caused and has not repaid yet
    }

    struct Vouch {
        address voucher;
        uint128 amount;
    }

    struct Credit {
        address creditor;
        uint128 amount;
    }

    struct Reputation {
        uint32 onTime; // contributions paid by the member before the deadline
        uint32 late; // paid by the member after the deadline (before the round was closed)
        uint32 missed; // covered by stake / vouchers / debt
        uint32 circlesCompleted; // finished without ever defaulting
        uint32 payouts; // pots collected
        uint128 savedValue; // total value paid on time
        uint128 vouchHonoured; // value vouched for people who never defaulted, returned in full
        uint128 vouchLost; // value slashed because a vouchee defaulted
    }

    /// @dev Outgoing transfers are queued and executed after all state changes (checks-effects-interactions).
    struct Transfer {
        address to;
        uint256 amount;
    }

    /// @notice Read model for frontends: one call returns everything about a member.
    struct MemberView {
        address account;
        Member data;
        bool paidThisRound;
        uint256 releasable;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    uint256 public circleCount;
    mapping(uint256 => Circle) internal _circles;
    mapping(uint256 => address[]) internal _order; // join order, then payout order after start
    mapping(uint256 => mapping(address => Member)) internal _members;
    mapping(uint256 => mapping(address => Vouch[])) internal _vouches; // vouchee => vouches
    mapping(uint256 => mapping(address => uint256)) public vouchLocked; // voucher => total still locked
    mapping(uint256 => mapping(address => uint256)) public vouchSlashed; // voucher => total lost
    mapping(uint256 => mapping(address => Credit[])) internal _credits; // debtor => who they owe
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public paid; // circle => round => member
    mapping(uint256 => mapping(uint256 => uint256)) public roundFunds; // circle => round => collected
    mapping(address => uint256[]) internal _circlesOf; // circles an address joined or vouched in
    mapping(uint256 => mapping(address => bool)) internal _listed;

    mapping(address => Reputation) public reputation;
    mapping(address => uint256) public claimable; // fallback when a push transfer fails

    // ─── Events ──────────────────────────────────────────────────────────────

    event CircleCreated(
        uint256 indexed circleId,
        address indexed organizer,
        string name,
        uint256 contribution,
        uint256 size,
        uint256 roundDuration,
        uint256 minStake
    );
    event Joined(uint256 indexed circleId, address indexed member, uint256 stake);
    event StakeAdded(uint256 indexed circleId, address indexed member, uint256 amount);
    event Vouched(uint256 indexed circleId, address indexed voucher, address indexed member, uint256 amount);
    event Started(uint256 indexed circleId, address[] payoutOrder);
    event Contributed(uint256 indexed circleId, uint256 indexed round, address indexed member, bool onTime);
    event PaidFromReserve(uint256 indexed circleId, uint256 indexed round, address indexed member, uint256 amount);
    event Covered(
        uint256 indexed circleId,
        uint256 indexed round,
        address indexed member,
        uint256 fromStake,
        uint256 fromVouchers,
        uint256 asDebt
    );
    event VoucherSlashed(uint256 indexed circleId, address indexed voucher, address indexed member, uint256 amount);
    event Payout(
        uint256 indexed circleId,
        uint256 indexed round,
        address indexed recipient,
        uint256 upfront,
        uint256 reserved,
        uint256 debtRepaid
    );
    event DebtRepaid(uint256 indexed circleId, address indexed debtor, address indexed creditor, uint256 amount);
    event ReserveReleased(uint256 indexed circleId, address indexed member, uint256 amount);
    event CircleCompleted(uint256 indexed circleId);
    event CircleCancelled(uint256 indexed circleId);
    event MemberSettled(uint256 indexed circleId, address indexed member, uint256 amount);
    event VoucherSettled(uint256 indexed circleId, address indexed voucher, uint256 amount);
    event TransferDeferred(address indexed to, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error InvalidSize();
    error InvalidDuration();
    error InvalidAmount();
    error NotOrganizer();
    error WrongStatus(Status expected, Status actual);
    error CircleFull();
    error NotFull();
    error AlreadyMember();
    error NotMember();
    error CannotVouchForSelf();
    error TooManyVouchers();
    error BadPayoutOrder();
    error AlreadyPaid();
    error RoundNotClosable();
    error NothingToClaim();

    constructor(IERC20 token_) {
        token = token_;
    }

    // ─── Setup ───────────────────────────────────────────────────────────────

    /// @notice Open a circle. The organizer joins as the first member and locks `stake` (≥ minStake).
    function createCircle(
        string calldata name,
        uint128 contribution,
        uint8 size,
        uint40 roundDuration,
        uint128 minStake,
        uint128 stake
    ) external nonReentrant returns (uint256 circleId) {
        if (size < MIN_MEMBERS || size > MAX_MEMBERS) revert InvalidSize();
        if (roundDuration < MIN_ROUND_DURATION || roundDuration > MAX_ROUND_DURATION) revert InvalidDuration();
        if (contribution == 0 || bytes(name).length == 0 || bytes(name).length > 64) revert InvalidAmount();

        circleId = circleCount++;
        Circle storage c = _circles[circleId];
        c.organizer = msg.sender;
        c.name = name;
        c.contribution = contribution;
        c.size = size;
        c.roundDuration = roundDuration;
        c.minStake = minStake;

        emit CircleCreated(circleId, msg.sender, name, contribution, size, roundDuration, minStake);
        _join(circleId, c, stake);
    }

    /// @notice Join an open circle, locking `stake` (≥ the circle's minStake).
    function join(uint256 circleId, uint128 stake) external nonReentrant {
        Circle storage c = _circles[circleId];
        _requireStatus(c, Status.Open);
        if (_order[circleId].length >= c.size) revert CircleFull();
        _join(circleId, c, stake);
    }

    /// @notice Lock more of your own money behind your obligations. Unlocks reserve immediately.
    function addStake(uint256 circleId, uint128 amount) external nonReentrant {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Open && c.status != Status.Active) revert WrongStatus(Status.Active, c.status);
        Member storage m = _members[circleId][msg.sender];
        if (!m.joined) revert NotMember();
        if (amount == 0) revert InvalidAmount();

        token.safeTransferFrom(msg.sender, address(this), amount);
        m.stake += amount;
        emit StakeAdded(circleId, msg.sender, amount);
    }

    /// @notice Put your money behind a member: if they fail to pay, your vouch covers it (pro-rata with
    ///         their other vouchers). If they never default you get it all back when the circle ends,
    ///         and your reputation records it. Anyone can vouch — a circle-mate, an aunt abroad, an employer.
    function vouch(uint256 circleId, address member, uint128 amount) external nonReentrant {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Open && c.status != Status.Active) revert WrongStatus(Status.Active, c.status);
        Member storage m = _members[circleId][member];
        if (!m.joined) revert NotMember();
        if (member == msg.sender) revert CannotVouchForSelf();
        if (amount == 0) revert InvalidAmount();

        Vouch[] storage list = _vouches[circleId][member];
        uint256 i;
        for (; i < list.length; ++i) {
            if (list[i].voucher == msg.sender) break;
        }
        if (i == list.length) {
            if (list.length >= MAX_VOUCHERS) revert TooManyVouchers();
            list.push(Vouch({voucher: msg.sender, amount: amount}));
        } else {
            list[i].amount += amount;
        }

        token.safeTransferFrom(msg.sender, address(this), amount);
        m.vouched += amount;
        vouchLocked[circleId][msg.sender] += amount;
        _track(circleId, msg.sender);
        emit Vouched(circleId, msg.sender, member, amount);
    }

    /// @notice Organizer starts the rotation once the circle is full. `payoutOrder` is the order members
    ///         collect in (as agreed by the group); pass an empty array to use join order.
    function start(uint256 circleId, address[] calldata payoutOrder) external nonReentrant {
        Circle storage c = _circles[circleId];
        if (msg.sender != c.organizer) revert NotOrganizer();
        _requireStatus(c, Status.Open);
        address[] storage order = _order[circleId];
        uint256 n = order.length;
        if (n != c.size) revert NotFull();

        if (payoutOrder.length != 0) {
            if (payoutOrder.length != n) revert BadPayoutOrder();
            // Must be a permutation of the members: each is a member, no duplicates (n ≤ 20).
            for (uint256 i; i < n; ++i) {
                if (!_members[circleId][payoutOrder[i]].joined) revert BadPayoutOrder();
                for (uint256 j; j < i; ++j) {
                    if (payoutOrder[j] == payoutOrder[i]) revert BadPayoutOrder();
                }
            }
            for (uint256 i; i < n; ++i) {
                order[i] = payoutOrder[i];
            }
        }
        for (uint256 i; i < n; ++i) {
            _members[circleId][order[i]].slot = uint8(i);
        }

        c.status = Status.Active;
        c.roundStart = uint40(block.timestamp);
        emit Started(circleId, order);
    }

    /// @notice Organizer cancels a circle that has not started. Everyone reclaims stakes and vouches.
    function cancel(uint256 circleId) external {
        Circle storage c = _circles[circleId];
        if (msg.sender != c.organizer) revert NotOrganizer();
        _requireStatus(c, Status.Open);
        c.status = Status.Cancelled;
        emit CircleCancelled(circleId);
    }

    // ─── Rounds ──────────────────────────────────────────────────────────────

    /// @notice Pay this round. If you are the last one needed, the pot is paid out in the same transaction.
    function contribute(uint256 circleId) external nonReentrant {
        Circle storage c = _circles[circleId];
        _requireStatus(c, Status.Active);
        Member storage m = _members[circleId][msg.sender];
        if (!m.joined) revert NotMember();
        uint256 round = c.currentRound;
        if (paid[circleId][round][msg.sender]) revert AlreadyPaid();

        uint128 amount = c.contribution;
        token.safeTransferFrom(msg.sender, address(this), amount);
        paid[circleId][round][msg.sender] = true;
        roundFunds[circleId][round] += amount;

        bool onTime = block.timestamp <= uint256(c.roundStart) + c.roundDuration;
        Reputation storage r = reputation[msg.sender];
        if (onTime) {
            r.onTime += 1;
            r.savedValue += amount;
        } else {
            r.late += 1;
        }
        emit Contributed(circleId, round, msg.sender, onTime);

        if (_everyoneCovered(circleId, c, round)) _closeRound(circleId, c, round, false);
    }

    /// @notice Close the current round. Before the deadline this only works if every member has paid or
    ///         has reserve to pay; after the deadline missing payments are covered (see contract docs)
    ///         and the pot goes out regardless — a circle can never be frozen by a non-payer.
    ///         Anyone can call this (a member, the recipient, or a keeper bot).
    function closeRound(uint256 circleId) external nonReentrant {
        Circle storage c = _circles[circleId];
        _requireStatus(c, Status.Active);
        uint256 round = c.currentRound;
        bool pastDeadline = block.timestamp > uint256(c.roundStart) + c.roundDuration;
        if (!pastDeadline && !_everyoneCovered(circleId, c, round)) revert RoundNotClosable();
        _closeRound(circleId, c, round, pastDeadline);
    }

    /// @notice Withdraw the part of your reserve that is now backed by stake or vouches.
    function releaseReserve(uint256 circleId) external nonReentrant returns (uint256 amount) {
        Circle storage c = _circles[circleId];
        _requireStatus(c, Status.Active);
        Member storage m = _members[circleId][msg.sender];
        amount = _releasable(circleId, c, msg.sender, m);
        if (amount == 0) revert NothingToClaim();
        m.reserve -= uint128(amount);
        emit ReserveReleased(circleId, msg.sender, amount);
        _push(msg.sender, amount);
    }

    // ─── After the circle ────────────────────────────────────────────────────

    /// @notice Members reclaim whatever stake and reserve they still have once the circle has ended.
    function settleMember(uint256 circleId) external nonReentrant returns (uint256 amount) {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Completed && c.status != Status.Cancelled) revert WrongStatus(Status.Completed, c.status);
        Member storage m = _members[circleId][msg.sender];
        if (!m.joined || m.settled) revert NothingToClaim();

        m.settled = true;
        amount = uint256(m.stake) + m.reserve;
        m.stake = 0;
        m.reserve = 0;
        if (c.status == Status.Completed && !m.defaulted) reputation[msg.sender].circlesCompleted += 1;

        // Anything still owed to circle-mates is paid before the member gets a refund.
        Credit[] storage credits = _credits[circleId][msg.sender];
        Transfer[] memory xfers = new Transfer[](credits.length);
        uint256 n;
        for (uint256 i; i < credits.length && amount > 0; ++i) {
            Credit storage cr = credits[i];
            if (cr.amount == 0) continue;
            uint128 pay = cr.amount <= amount ? cr.amount : uint128(amount);
            cr.amount -= pay;
            m.debt -= pay;
            amount -= pay;
            emit DebtRepaid(circleId, msg.sender, cr.creditor, pay);
            xfers[n++] = Transfer(cr.creditor, pay);
        }

        emit MemberSettled(circleId, msg.sender, amount);
        for (uint256 i; i < n; ++i) {
            _push(xfers[i].to, xfers[i].amount);
        }
        if (amount > 0) _push(msg.sender, amount);
    }

    /// @notice Vouchers reclaim what is left of their vouches once the circle has ended.
    function settleVoucher(uint256 circleId) external nonReentrant returns (uint256 amount) {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Completed && c.status != Status.Cancelled) revert WrongStatus(Status.Completed, c.status);
        amount = vouchLocked[circleId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        vouchLocked[circleId][msg.sender] = 0;
        // Losses are recorded when they happen (in _slashVouchers); here we record what came back whole.
        if (c.status == Status.Completed) reputation[msg.sender].vouchHonoured += uint128(amount);
        emit VoucherSettled(circleId, msg.sender, amount);
        _push(msg.sender, amount);
    }

    /// @notice Fallback for payouts that could not be pushed.
    function withdrawClaimable() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getCircle(uint256 circleId) external view returns (Circle memory) {
        return _circles[circleId];
    }

    function getMembers(uint256 circleId) external view returns (MemberView[] memory out) {
        Circle storage c = _circles[circleId];
        address[] storage order = _order[circleId];
        out = new MemberView[](order.length);
        for (uint256 i; i < order.length; ++i) {
            address a = order[i];
            Member storage m = _members[circleId][a];
            out[i] = MemberView({
                account: a,
                data: m,
                paidThisRound: paid[circleId][c.currentRound][a],
                releasable: c.status == Status.Active ? _releasable(circleId, c, a, m) : 0
            });
        }
    }

    function getVouches(uint256 circleId, address member) external view returns (Vouch[] memory) {
        return _vouches[circleId][member];
    }

    function getCredits(uint256 circleId, address debtor) external view returns (Credit[] memory) {
        return _credits[circleId][debtor];
    }

    function circlesOf(address account) external view returns (uint256[] memory) {
        return _circlesOf[account];
    }

    /// @notice What `member` would collect if their turn came now: (upfront, reserved).
    ///         This is what the app shows as "vouches unlock ₦X of your pot".
    function previewPayout(uint256 circleId, address member) external view returns (uint256 upfront, uint256 reserved) {
        Circle storage c = _circles[circleId];
        Member storage m = _members[circleId][member];
        uint256 pot = uint256(c.contribution) * c.size;
        uint256 dues = uint256(c.contribution) * (c.size - 1 - m.slot);
        uint256 backing = uint256(m.stake) + m.vouched;
        reserved = dues > backing ? dues - backing : 0;
        if (reserved > pot) reserved = pot;
        upfront = pot - reserved;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _join(uint256 circleId, Circle storage c, uint128 stake) internal {
        Member storage m = _members[circleId][msg.sender];
        if (m.joined) revert AlreadyMember();
        if (stake < c.minStake) revert InvalidAmount();

        m.joined = true;
        m.stake = stake;
        _order[circleId].push(msg.sender);
        _track(circleId, msg.sender);
        if (stake > 0) token.safeTransferFrom(msg.sender, address(this), stake);
        emit Joined(circleId, msg.sender, stake);
    }

    /// @dev True when every member has either paid this round or holds enough reserve to pay it.
    function _everyoneCovered(uint256 circleId, Circle storage c, uint256 round) internal view returns (bool) {
        address[] storage order = _order[circleId];
        for (uint256 i; i < order.length; ++i) {
            address a = order[i];
            if (!paid[circleId][round][a] && _members[circleId][a].reserve < c.contribution) return false;
        }
        return true;
    }

    function _closeRound(uint256 circleId, Circle storage c, uint256 round, bool pastDeadline) internal {
        address[] storage order = _order[circleId];
        address recipient = order[round];
        uint128 amount = c.contribution;

        // 1. Fund every unpaid seat: reserve first (not a default), then cover after the deadline.
        for (uint256 i; i < order.length; ++i) {
            address a = order[i];
            if (paid[circleId][round][a]) continue;
            Member storage m = _members[circleId][a];
            paid[circleId][round][a] = true;

            if (m.reserve >= amount) {
                m.reserve -= amount;
                roundFunds[circleId][round] += amount;
                emit PaidFromReserve(circleId, round, a, amount);
            } else if (pastDeadline) {
                roundFunds[circleId][round] += _cover(circleId, round, a, m, recipient, amount);
            }
        }

        // 2. Work out the payout (state only).
        (Transfer[] memory xfers, uint256 n) = _payout(circleId, c, round, recipient);

        // 3. Advance.
        if (round + 1 == c.size) {
            c.status = Status.Completed;
            emit CircleCompleted(circleId);
        } else {
            c.currentRound = uint8(round + 1);
            c.roundStart = uint40(block.timestamp);
        }

        // 4. Move the money last.
        for (uint256 i; i < n; ++i) {
            _push(xfers[i].to, xfers[i].amount);
        }
    }

    /// @dev Covers a missed payment. Returns how much actually reached the round (the rest becomes debt).
    function _cover(
        uint256 circleId,
        uint256 round,
        address who,
        Member storage m,
        address recipient,
        uint128 amount
    ) internal returns (uint128 funded) {
        uint128 need = amount;

        // Partial reserve counts too.
        uint128 fromReserve = m.reserve < need ? m.reserve : need;
        m.reserve -= fromReserve;
        need -= fromReserve;

        uint128 fromStake = m.stake < need ? m.stake : need;
        m.stake -= fromStake;
        need -= fromStake;

        uint128 fromVouchers;
        if (need > 0 && m.vouched > 0) {
            fromVouchers = m.vouched < need ? m.vouched : need;
            _slashVouchers(circleId, who, m, fromVouchers);
            need -= fromVouchers;
        }

        uint128 asDebt = need;
        if (asDebt > 0 && recipient != who) {
            m.debt += asDebt;
            _credits[circleId][who].push(Credit({creditor: recipient, amount: asDebt}));
        }

        m.defaulted = true;
        reputation[who].missed += 1;
        emit Covered(circleId, round, who, fromStake, fromVouchers, asDebt);
        return amount - asDebt;
    }

    /// @dev Takes `total` from a member's vouchers, pro-rata to what each vouched.
    function _slashVouchers(uint256 circleId, address who, Member storage m, uint128 total) internal {
        Vouch[] storage list = _vouches[circleId][who];
        uint256 backing = m.vouched;
        uint128 remaining = total;
        for (uint256 i; i < list.length && remaining > 0; ++i) {
            Vouch storage v = list[i];
            if (v.amount == 0) continue;
            // Last non-empty voucher absorbs rounding so exactly `total` is taken.
            uint128 share = i == list.length - 1 ? remaining : uint128((uint256(total) * v.amount) / backing);
            if (share > v.amount) share = v.amount;
            if (share > remaining) share = remaining;
            v.amount -= share;
            remaining -= share;
            vouchLocked[circleId][v.voucher] -= share;
            vouchSlashed[circleId][v.voucher] += share;
            reputation[v.voucher].vouchLost += share;
            emit VoucherSlashed(circleId, v.voucher, who, share);
        }
        // Rounding left over (only possible if the last entry was already empty): sweep from any voucher.
        for (uint256 i; i < list.length && remaining > 0; ++i) {
            Vouch storage v = list[i];
            uint128 share = v.amount < remaining ? v.amount : remaining;
            v.amount -= share;
            remaining -= share;
            vouchLocked[circleId][v.voucher] -= share;
            vouchSlashed[circleId][v.voucher] += share;
            reputation[v.voucher].vouchLost += share;
            if (share > 0) emit VoucherSlashed(circleId, v.voucher, who, share);
        }
        m.vouched -= total;
    }

    /// @dev Updates all payout state and returns the transfers to make (executed by the caller, last).
    function _payout(uint256 circleId, Circle storage c, uint256 round, address recipient)
        internal
        returns (Transfer[] memory xfers, uint256 n)
    {
        Member storage m = _members[circleId][recipient];
        uint256 available = roundFunds[circleId][round];
        Credit[] storage credits = _credits[circleId][recipient];
        xfers = new Transfer[](credits.length + 1);

        // a. A recipient who caused shortfalls earlier repays those members first, out of their own pot.
        uint256 repaid;
        for (uint256 i; i < credits.length && available > 0; ++i) {
            Credit storage cr = credits[i];
            if (cr.amount == 0) continue;
            uint128 pay = cr.amount <= available ? cr.amount : uint128(available);
            cr.amount -= pay;
            m.debt -= pay;
            available -= pay;
            repaid += pay;
            emit DebtRepaid(circleId, recipient, cr.creditor, pay);
            xfers[n++] = Transfer(cr.creditor, pay);
        }

        // b. Hold back whatever part of their remaining contributions nobody has backed.
        uint256 dues = uint256(c.contribution) * (c.size - 1 - round);
        uint256 backing = uint256(m.stake) + m.vouched + m.reserve;
        uint256 reserved = dues > backing ? dues - backing : 0;
        if (reserved > available) reserved = available;
        m.reserve += uint128(reserved);
        available -= reserved;

        // c. The rest is theirs, now.
        m.received = true;
        reputation[recipient].payouts += 1;
        emit Payout(circleId, round, recipient, available, reserved, repaid);
        if (available > 0) xfers[n++] = Transfer(recipient, available);
    }

    /// @dev Reserve not needed to keep (reserve + stake + vouches) ≥ remaining contributions.
    function _releasable(uint256 circleId, Circle storage c, address who, Member storage m)
        internal
        view
        returns (uint256)
    {
        if (m.reserve == 0) return 0;
        uint256 round = c.currentRound;
        uint256 dues = uint256(c.contribution) * (c.size - 1 - round);
        if (!paid[circleId][round][who]) dues += c.contribution;
        uint256 backing = uint256(m.stake) + m.vouched;
        uint256 needed = dues > backing ? dues - backing : 0;
        return m.reserve > needed ? m.reserve - needed : 0;
    }

    /// @dev Push tokens; if the token refuses (e.g. blocklisted recipient), credit `claimable` instead
    ///      so one bad recipient can never block a circle.
    function _push(address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (ok && (data.length == 0 || abi.decode(data, (bool)))) return;
        claimable[to] += amount;
        emit TransferDeferred(to, amount);
    }

    function _track(uint256 circleId, address who) internal {
        if (_listed[circleId][who]) return;
        _listed[circleId][who] = true;
        _circlesOf[who].push(circleId);
    }

    function _requireStatus(Circle storage c, Status s) internal view {
        if (c.status != s) revert WrongStatus(s, c.status);
    }
}
