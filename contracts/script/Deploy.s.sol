// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ajo} from "../src/Ajo.sol";
import {TestDollar} from "../src/TestDollar.sol";

/// @notice Deploys the test dollar + Ajo and prints the env lines for the web app.
///   forge script script/Deploy.s.sol --rpc-url <rpc> --private-key $PRIVATE_KEY --broadcast
/// Set STABLECOIN=<address> to use an existing stablecoin (e.g. AUSD/USDC) instead of the test dollar.
contract DeployScript is Script {
    function run() external returns (Ajo ajo, address token) {
        token = vm.envOr("STABLECOIN", address(0));
        vm.startBroadcast();
        if (token == address(0)) token = address(new TestDollar());
        ajo = new Ajo(IERC20(token));
        vm.stopBroadcast();

        console.log("Paste into web/.env.local:");
        console.log(string.concat("NEXT_PUBLIC_AJO_ADDRESS=", vm.toString(address(ajo))));
        console.log(string.concat("NEXT_PUBLIC_TOKEN_ADDRESS=", vm.toString(token)));
    }
}
