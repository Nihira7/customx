
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockVerifier {
    function verify(
        bytes calldata proof,
        bytes32[] calldata
    ) external pure returns (bool) {
        // TEST ONLY:
        // 0x01 represents an accepted dummy proof.
        // 0x00 represents a rejected dummy proof.
        return keccak256(proof) == keccak256(hex"01");
    }
}