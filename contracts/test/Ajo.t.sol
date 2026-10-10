// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ajo} from "../src/Ajo.sol";
import {TestDollar} from "../src/TestDollar.sol";

/// @dev Token that refuses transfers to one address, to prove a bad recipient can't freeze a circle.
contract BlockingToken is ERC20 {
    address public blocked;

    constructor() ERC20("Blocking", "BLK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address who) external {
        blocked = who;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(to != blocked, "blocked");
        super._update(from, to, value);
    }
}

contract AjoTest is Test {
    Ajo ajo;
    TestDollar usd;

    address ada = makeAddr("ada");
    address bola = makeAddr("bola");
    address chidi = makeAddr("chidi");
    address dayo = makeAddr("dayo");
    address eze = makeAddr("eze"); // outside voucher, e.g. a relative abroad
    address keeper = makeAddr("keeper");

    uint128 constant C = 100e6; // $100 per round
    uint40 constant ROUND = 1 days;
    uint256 constant START_BAL = 10_000e6;

    address[] people;

    function setUp() public {
        vm.warp(1_760_000_000);
        usd = new TestDollar();
        ajo = new Ajo(IERC20(address(usd)));
        people = [ada, bola, chidi, dayo, eze];
        for (uint256 i; i < people.length; ++i) {
            deal(address(usd), people[i], START_BAL);
            vm.prank(people[i]);
            usd.approve(address(ajo), type(uint256).max);
        }
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    /// @dev 4-member circle (ada organizes), each member locks `stake`. Not started.
    function _circle(uint128 minStake, uint128 stake) internal returns (uint256 id) {
        vm.prank(ada);
        id = ajo.createCircle("Ogbomoso Traders", C, 4, ROUND, minStake, stake);
        vm.prank(bola);
        ajo.join(id, stake);
        vm.prank(chidi);
        ajo.join(id, stake);
        vm.prank(dayo);
        ajo.join(id, stake);
    }

    function _start(uint256 id) internal {
        vm.prank(ada);
        ajo.start(id, new address[](0));
    }

    function _pay(uint256 id, address who) internal {
        vm.prank(who);
        ajo.contribute(id);
    }

    function _round(uint256 id) internal view returns (uint256) {
        return ajo.getCircle(id).currentRound;
    }

    function _status(uint256 id) internal view returns (Ajo.Status) {
        return ajo.getCircle(id).status;
    }

    function _member(uint256 id, address who) internal view returns (Ajo.Member memory m) {
        Ajo.MemberView[] memory all = ajo.getMembers(id);
        for (uint256 i; i < all.length; ++i) {
            if (all[i].account == who) return all[i].data;
        }
        revert("not found");
    }

    function _settleAll(uint256 id) internal {
        address[4] memory ms = [ada, bola, chidi, dayo];
        for (uint256 i; i < 4; ++i) {
            vm.prank(ms[i]);
            try ajo.settleMember(id) {} catch {}
        }
        vm.prank(eze);
        try ajo.settleVoucher(id) {} catch {}
    }

    // ─── identity ────────────────────────────────────────────────────────────

    function test_SetName() public {
        uint256 id = _circle(0, 0);
        vm.prank(bola);
        ajo.setName("Bola");
        assertEq(ajo.nameOf(bola), "Bola");
        assertEq(ajo.getMembers(id)[1].name, "Bola");
        vm.prank(bola);
        vm.expectRevert(Ajo.InvalidName.selector);
        ajo.setName("");
        vm.prank(bola);
        vm.expectRevert(Ajo.InvalidName.selector);
        ajo.setName("a name that is far too long for a circle");
    }

    // ─── setup rules ─────────────────────────────────────────────────────────

    function test_CreateAndJoin() public {
        uint256 id = _circle(50e6, 50e6);
        Ajo.Circle memory c = ajo.getCircle(id);
        assertEq(c.organizer, ada);
        assertEq(c.size, 4);
        assertEq(uint8(c.status), uint8(Ajo.Status.Open));
        assertEq(usd.balanceOf(address(ajo)), 200e6);
        assertEq(ajo.getMembers(id).length, 4);
        assertEq(ajo.circlesOf(bola)[0], id);
    }

    function test_RevertWhen_BadSetup() public {
        vm.startPrank(ada);
        vm.expectRevert(Ajo.InvalidSize.selector);
        ajo.createCircle("x", C, 1, ROUND, 0, 0);
        vm.expectRevert(Ajo.InvalidSize.selector);
        ajo.createCircle("x", C, 21, ROUND, 0, 0);
        vm.expectRevert(Ajo.InvalidDuration.selector);
        ajo.createCircle("x", C, 4, 10, 0, 0);
        vm.expectRevert(Ajo.InvalidAmount.selector);
        ajo.createCircle("x", 0, 4, ROUND, 0, 0);
        vm.expectRevert(Ajo.InvalidAmount.selector);
        ajo.createCircle("x", C, 4, ROUND, 50e6, 10e6); // stake below minimum
        vm.stopPrank();
    }

    function test_RevertWhen_JoinRules() public {
        uint256 id = _circle(0, 0);
        vm.prank(eze);
        vm.expectRevert(Ajo.CircleFull.selector);
        ajo.join(id, 0);

        vm.prank(ada);
        uint256 id2 = ajo.createCircle("y", C, 3, ROUND, 0, 0);
        vm.prank(ada);
        vm.expectRevert(Ajo.AlreadyMember.selector);
        ajo.join(id2, 0);
        vm.prank(ada);
        vm.expectRevert(Ajo.NotFull.selector);
        ajo.start(id2, new address[](0));
    }

    function test_RevertWhen_NonOrganizerStarts() public {
        uint256 id = _circle(0, 0);
        vm.prank(bola);
        vm.expectRevert(Ajo.NotOrganizer.selector);
        ajo.start(id, new address[](0));
    }

    function test_CustomPayoutOrder() public {
        uint256 id = _circle(0, 0);
        address[] memory order = new address[](4);
        order[0] = dayo;
        order[1] = chidi;
        order[2] = bola;
        order[3] = ada;
        vm.prank(ada);
        ajo.start(id, order);
        assertEq(ajo.getMembers(id)[0].account, dayo);
        assertEq(_member(id, ada).slot, 3);
    }

    function test_RevertWhen_PayoutOrderInvalid() public {
        uint256 id = _circle(0, 0);
        address[] memory dup = new address[](4);
        dup[0] = ada;
        dup[1] = ada;
        dup[2] = bola;
        dup[3] = chidi;
        vm.prank(ada);
        vm.expectRevert(Ajo.BadPayoutOrder.selector);
        ajo.start(id, dup);

        address[] memory stranger = new address[](4);
        stranger[0] = ada;
        stranger[1] = bola;
        stranger[2] = chidi;
        stranger[3] = eze;
        vm.prank(ada);
        vm.expectRevert(Ajo.BadPayoutOrder.selector);
        ajo.start(id, stranger);
    }

    function test_RevertWhen_VouchForSelfOrStranger() public {
        uint256 id = _circle(0, 0);
        vm.prank(ada);
        vm.expectRevert(Ajo.CannotVouchForSelf.selector);
        ajo.vouch(id, ada, 10e6);
        vm.prank(ada);
        vm.expectRevert(Ajo.NotMember.selector);
        ajo.vouch(id, eze, 10e6);
    }

    function test_RevertWhen_DustVouch() public {
        uint256 id = _circle(0, 0);
        vm.prank(eze);
        vm.expectRevert(Ajo.InvalidAmount.selector);
        ajo.vouch(id, bola, 1); // can't fill voucher slots with dust
        vm.prank(eze);
        ajo.vouch(id, bola, C / 10); // a tenth of a contribution is the floor
    }

    function test_Cancel_RefundsStakesAndVouches() public {
        uint256 id = _circle(50e6, 50e6);
        vm.prank(eze);
        ajo.vouch(id, bola, 200e6);
        vm.prank(ada);
        ajo.cancel(id);

        _settleAll(id);
        for (uint256 i; i < people.length; ++i) {
            assertEq(usd.balanceOf(people[i]), START_BAL);
        }
        assertEq(usd.balanceOf(address(ajo)), 0);
    }

    // ─── the happy path ──────────────────────────────────────────────────────

    function test_LastPaymentPaysPotInstantly() public {
        uint256 id = _circle(0, 0);
        // Fully back everyone so the whole pot goes out upfront.
        vm.startPrank(eze);
        ajo.vouch(id, ada, 300e6);
        ajo.vouch(id, bola, 200e6);
        ajo.vouch(id, chidi, 100e6);
        vm.stopPrank();
        _start(id);

        _pay(id, ada);
        _pay(id, bola);
        _pay(id, chidi);
        uint256 before = usd.balanceOf(ada);
        _pay(id, dayo); // last one in → pot goes to ada in the same tx

        assertEq(usd.balanceOf(ada) - before, 400e6);
        assertEq(_round(id), 1);
    }

    function test_FullCircle_EveryoneEndsWhole() public {
        uint256 id = _circle(0, 0);
        vm.startPrank(eze);
        ajo.vouch(id, ada, 300e6);
        ajo.vouch(id, bola, 200e6);
        ajo.vouch(id, chidi, 100e6);
        vm.stopPrank();
        _start(id);

        address[4] memory ms = [ada, bola, chidi, dayo];
        for (uint256 r; r < 4; ++r) {
            for (uint256 i; i < 4; ++i) {
                _pay(id, ms[i]);
            }
        }
        assertEq(uint8(_status(id)), uint8(Ajo.Status.Completed));
        _settleAll(id);

        for (uint256 i; i < people.length; ++i) {
            assertEq(usd.balanceOf(people[i]), START_BAL, "everyone whole");
        }
        assertEq(usd.balanceOf(address(ajo)), 0, "nothing stuck");

        (uint32 onTime,,, uint32 completed, uint32 payouts, uint128 saved,,) = ajo.reputation(bola);
        assertEq(onTime, 4);
        assertEq(completed, 1);
        assertEq(payouts, 1);
        assertEq(saved, 400e6);
        (,,,,,, uint128 honoured, uint128 lost) = ajo.reputation(eze);
        assertEq(honoured, 600e6);
        assertEq(lost, 0);
    }

    // ─── trust = liquidity ───────────────────────────────────────────────────

    function test_UnbackedEarlyCollectorGetsReserveNotCash() public {
        uint256 id = _circle(0, 0);
        _start(id);
        (uint256 up, uint256 res) = ajo.previewPayout(id, ada);
        assertEq(up, 100e6);
        assertEq(res, 300e6);

        uint256 before = usd.balanceOf(ada);
        _pay(id, ada);
        _pay(id, bola);
        _pay(id, chidi);
        _pay(id, dayo);

        // ada put in 100 and gets 100 now; the 300 she still owes is held and pays for her.
        assertEq(usd.balanceOf(ada), before);
        assertEq(_member(id, ada).reserve, 300e6);

        // Round 1: ada does nothing — her reserve pays, and the pot goes out the moment the others pay.
        _pay(id, bola);
        _pay(id, chidi);
        _pay(id, dayo);
        assertEq(_round(id), 2);
        assertEq(_member(id, ada).reserve, 200e6);
        assertFalse(_member(id, ada).defaulted, "reserve paying is not a default");
    }

    function test_VouchBeforeTurnUnlocksFullPot() public {
        uint256 id = _circle(0, 0);
        vm.prank(eze);
        ajo.vouch(id, ada, 300e6);
        _start(id);
        (uint256 up, uint256 res) = ajo.previewPayout(id, ada);
        assertEq(up, 400e6);
        assertEq(res, 0);
    }

    function test_PartialBackingSplitsPot() public {
        uint256 id = _circle(0, 100e6); // everyone stakes 100
        vm.prank(eze);
        ajo.vouch(id, ada, 50e6);
        _start(id);
        (uint256 up, uint256 res) = ajo.previewPayout(id, ada);
        // dues 300, backing 150 → 150 held, 250 upfront
        assertEq(up, 250e6);
        assertEq(res, 150e6);
    }

    function test_VouchAfterPayoutReleasesReserve() public {
        uint256 id = _circle(0, 0);
        _start(id);
        _pay(id, ada);
        _pay(id, bola);
        _pay(id, chidi);
        _pay(id, dayo);
        assertEq(_member(id, ada).reserve, 300e6);

        vm.prank(eze);
        ajo.vouch(id, ada, 200e6);
        // Round 1 unpaid by ada: dues = 300 (this round + 2 more), backing 200 → keep 100, release 200.
        assertEq(ajo.getMembers(id)[0].releasable, 200e6);
        uint256 before = usd.balanceOf(ada);
        vm.prank(ada);
        ajo.releaseReserve(id);
        assertEq(usd.balanceOf(ada) - before, 200e6);
    }

    function test_PayingFromWalletUnlocksReserveToo() public {
        uint256 id = _circle(0, 0);
        _start(id);
        for (uint256 i; i < 4; ++i) {
            _pay(id, [ada, bola, chidi, dayo][i]);
        }
        // ada pays round 1 herself instead of letting the reserve pay.
        _pay(id, ada);
        assertEq(ajo.getMembers(id)[0].releasable, 100e6);
    }

    // ─── defaults: the circle never freezes ──────────────────────────────────

    function test_RevertWhen_ClosingEarlyWithUnpaidMember() public {
        uint256 id = _circle(0, 0);
        _start(id);
        _pay(id, ada);
        vm.prank(keeper);
        vm.expectRevert(Ajo.RoundNotClosable.selector);
        ajo.closeRound(id);
    }

    function test_EarlyCollectorWhoStopsPaying_VouchersCover() public {
        uint256 id = _circle(0, 0);
        vm.prank(eze);
        ajo.vouch(id, ada, 300e6); // eze backs ada fully
        _start(id);
        for (uint256 i; i < 4; ++i) {
            _pay(id, [ada, bola, chidi, dayo][i]);
        }
        assertEq(usd.balanceOf(ada), START_BAL + 300e6); // ada took the full pot

        // ada disappears for the rest of the circle.
        for (uint256 r = 1; r < 4; ++r) {
            _pay(id, bola);
            _pay(id, chidi);
            _pay(id, dayo);
            vm.warp(block.timestamp + ROUND + 1);
            vm.prank(keeper);
            ajo.closeRound(id);
        }
        assertEq(uint8(_status(id)), uint8(Ajo.Status.Completed));
        assertTrue(_member(id, ada).defaulted);
        _settleAll(id);

        // Honest members are whole; the voucher bore the loss; ada kept 300 that eze paid for.
        assertEq(usd.balanceOf(bola), START_BAL);
        assertEq(usd.balanceOf(chidi), START_BAL);
        assertEq(usd.balanceOf(dayo), START_BAL);
        assertEq(usd.balanceOf(eze), START_BAL - 300e6);
        assertEq(usd.balanceOf(address(ajo)), 0);

        (,, uint32 missed,,,,,) = ajo.reputation(ada);
        assertEq(missed, 3);
        (,,,,,, uint128 honoured, uint128 lost) = ajo.reputation(eze);
        assertEq(lost, 300e6);
        assertEq(honoured, 0);
    }

    function test_StakeIsUsedBeforeVouchers() public {
        uint256 id = _circle(0, 100e6);
        vm.prank(eze);
        ajo.vouch(id, ada, 200e6);
        _start(id);
        for (uint256 i; i < 4; ++i) {
            _pay(id, [ada, bola, chidi, dayo][i]);
        }
        // ada misses round 1: her own 100 stake covers it, eze untouched.
        _pay(id, bola);
        _pay(id, chidi);
        _pay(id, dayo);
        vm.warp(block.timestamp + ROUND + 1);
        ajo.closeRound(id);
        assertEq(_member(id, ada).stake, 0);
        assertEq(ajo.vouchLocked(id, eze), 200e6);
    }

    function test_VoucherSlashIsProRata() public {
        uint256 id = _circle(0, 0);
        vm.prank(eze);
        ajo.vouch(id, ada, 225e6);
        vm.prank(dayo);
        ajo.vouch(id, ada, 75e6);
        _start(id);
        for (uint256 i; i < 4; ++i) {
            _pay(id, [ada, bola, chidi, dayo][i]);
        }
        _pay(id, bola);
        _pay(id, chidi);
        _pay(id, dayo);
        vm.warp(block.timestamp + ROUND + 1);
        ajo.closeRound(id);
        assertEq(ajo.vouchSlashed(id, eze), 75e6);
        assertEq(ajo.vouchSlashed(id, dayo), 25e6);
    }

    function test_LateCollectorWhoStopsPaying_RepaysFromOwnPot() public {
        uint256 id = _circle(0, 0); // no stakes, no vouches
        _start(id); // order: ada, bola, chidi, dayo
        for (uint256 i; i < 4; ++i) {
            _pay(id, [ada, bola, chidi, dayo][i]);
        }
        // dayo (collects last) stops paying in rounds 1 and 2 → bola and chidi are short 100 each.
        for (uint256 r = 1; r < 3; ++r) {
            _pay(id, bola);
            _pay(id, chidi);
            vm.warp(block.timestamp + ROUND + 1);
            ajo.closeRound(id);
        }
        assertEq(_member(id, dayo).debt, 200e6);
        assertEq(ajo.getCredits(id, dayo).length, 2);

        // Round 3 is dayo's turn: bola/chidi are repaid out of dayo's pot before dayo sees a cent.
        uint256 bolaBefore = usd.balanceOf(bola);
        _pay(id, bola);
        _pay(id, chidi);
        vm.warp(block.timestamp + ROUND + 1);
        ajo.closeRound(id);
        assertEq(usd.balanceOf(bola), bolaBefore, "bola paid 100 this round and was repaid the 100 he was short");
        assertEq(_member(id, dayo).debt, 0);

        _settleAll(id);
        assertEq(usd.balanceOf(bola), START_BAL);
        assertEq(usd.balanceOf(chidi), START_BAL);
        assertEq(usd.balanceOf(ada), START_BAL);
        assertEq(usd.balanceOf(address(ajo)), 0);
    }

    function test_LateContributionStillAccepted() public {
        uint256 id = _circle(0, 0);
        _start(id);
        vm.warp(block.timestamp + ROUND + 10);
        _pay(id, bola);
        (, uint32 late,,,,,,) = ajo.reputation(bola);
        assertEq(late, 1);
    }

    function test_RevertWhen_PayTwiceOrNotMember() public {
        uint256 id = _circle(0, 0);
        _start(id);
        _pay(id, ada);
        vm.prank(ada);
        vm.expectRevert(Ajo.AlreadyPaid.selector);
        ajo.contribute(id);
        vm.prank(eze);
        vm.expectRevert(Ajo.NotMember.selector);
        ajo.contribute(id);
    }

    function test_BlockedRecipientCannotFreezeCircle() public {
        BlockingToken blk = new BlockingToken();
        Ajo a2 = new Ajo(IERC20(address(blk)));
        address[4] memory ms = [ada, bola, chidi, dayo];
        for (uint256 i; i < 4; ++i) {
            blk.mint(ms[i], START_BAL);
            vm.prank(ms[i]);
            blk.approve(address(a2), type(uint256).max);
        }
        vm.prank(ada);
        uint256 id = a2.createCircle("x", C, 4, ROUND, 0, 300e6);
        for (uint256 i = 1; i < 4; ++i) {
            vm.prank(ms[i]);
            a2.join(id, 300e6);
        }
        vm.prank(ada);
        a2.start(id, new address[](0));

        blk.setBlocked(ada); // ada's address can no longer receive
        for (uint256 i; i < 4; ++i) {
            vm.prank(ms[i]);
            a2.contribute(id);
        }
        assertEq(a2.getCircle(id).currentRound, 1, "circle moved on");
        assertEq(a2.claimable(ada), 400e6, "ada's pot is safe in claimable");
    }

    // ─── fuzz: money is conserved, nothing gets stuck, honest members are whole ──

    /// @param seed drives who pays each round
    /// @param stakeSeed / vouchSeed drive stakes and outside vouches
    function testFuzz_ConservationAndHonestMembersWhole(uint256 seed, uint256 stakeSeed, uint256 vouchSeed) public {
        address[4] memory ms = [ada, bola, chidi, dayo];
        uint128[4] memory stakes;
        for (uint256 i; i < 4; ++i) {
            stakes[i] = uint128(bound(uint256(keccak256(abi.encode(stakeSeed, i))), 0, 400e6));
        }
        vm.prank(ada);
        uint256 id = ajo.createCircle("fuzz", C, 4, ROUND, 0, stakes[0]);
        for (uint256 i = 1; i < 4; ++i) {
            vm.prank(ms[i]);
            ajo.join(id, stakes[i]);
        }
        for (uint256 i; i < 4; ++i) {
            uint128 v = uint128(bound(uint256(keccak256(abi.encode(vouchSeed, i))), 0, 400e6));
            if (v >= C / 10) {
                vm.prank(eze);
                ajo.vouch(id, ms[i], v);
            }
        }
        _start(id);

        bool[4] memory everMissed;
        for (uint256 r; r < 4; ++r) {
            for (uint256 i; i < 4; ++i) {
                if (_status(id) != Ajo.Status.Active || _round(id) != r) break;
                bool pays = uint256(keccak256(abi.encode(seed, r, i))) % 4 != 0; // 75% pay
                if (pays && !ajo.paid(id, r, ms[i])) _pay(id, ms[i]);
            }
            if (_status(id) == Ajo.Status.Active && _round(id) == r) {
                for (uint256 i; i < 4; ++i) {
                    if (!ajo.paid(id, r, ms[i]) && _member(id, ms[i]).reserve < C) everMissed[i] = true;
                }
                vm.warp(block.timestamp + ROUND + 1);
                ajo.closeRound(id);
            }
        }
        assertEq(uint8(_status(id)), uint8(Ajo.Status.Completed));
        _settleAll(id);

        // 1. Nothing stuck in the contract.
        assertEq(usd.balanceOf(address(ajo)), 0, "stuck funds");

        // 2. Conservation: total across everyone unchanged.
        uint256 total;
        for (uint256 i; i < people.length; ++i) {
            total += usd.balanceOf(people[i]);
        }
        assertEq(total, START_BAL * people.length, "money created or destroyed");

        // 3. Every member who never missed ends whole, counting IOUs still owed to them.
        for (uint256 i; i < 4; ++i) {
            if (everMissed[i]) continue;
            uint256 owed;
            for (uint256 d; d < 4; ++d) {
                Ajo.Credit[] memory cr = ajo.getCredits(id, ms[d]);
                for (uint256 k; k < cr.length; ++k) {
                    if (cr[k].creditor == ms[i]) owed += cr[k].amount;
                }
            }
            assertEq(usd.balanceOf(ms[i]) + owed, START_BAL, "honest member lost money");
        }
    }
}
