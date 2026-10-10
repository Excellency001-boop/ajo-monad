// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Ajo} from "../src/Ajo.sol";
import {TestDollar} from "../src/TestDollar.sol";

/// @notice LOCAL QA ONLY (anvil). Fills a circle with anvil's unlocked dev accounts so the UI can be
///         exercised end to end. Never point this at a real network.
///   AJO=<addr> TOKEN=<addr> forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8546 \
///     --broadcast --unlocked --sender 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
contract SeedLocalScript is Script {
    // anvil default accounts 1..3 (account 0 is the person testing the UI)
    address constant A1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant A2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address constant A3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    function run() external {
        require(block.chainid == 31337 || block.chainid == 10143, "local only");
        require(block.number < 1_000_000, "refusing: this looks like a real network");
        Ajo ajo = Ajo(vm.envAddress("AJO"));
        TestDollar usd = TestDollar(vm.envAddress("TOKEN"));

        string[3] memory names = ["Bola", "Chidi", "Dayo"];
        address[3] memory accounts = [A1, A2, A3];

        // Circle 0: "Ogbomoso Traders" — 4 seats, organised by Bola, 3 joined, waiting for you.
        vm.startBroadcast(A1);
        usd.faucet();
        usd.approve(address(ajo), type(uint256).max);
        ajo.setName(names[0]);
        uint256 id = ajo.createCircle("Ogbomoso Traders", 100e6, 4, 2 minutes, 0, 50e6);
        vm.stopBroadcast();

        for (uint256 i = 1; i < 3; ++i) {
            vm.startBroadcast(accounts[i]);
            usd.faucet();
            usd.approve(address(ajo), type(uint256).max);
            ajo.setName(names[i]);
            ajo.join(id, 50e6);
            vm.stopBroadcast();
        }
        console.log("Seeded circle", id, "- 3 of 4 seats filled; join from the UI to fill it.");
    }
}
