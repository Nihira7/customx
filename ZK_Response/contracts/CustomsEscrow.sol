// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

contract CustomsEscrow {
    address public immutable verifierAddress;

    event ProofSubmitted(bytes32 indexed invoiceHash, address indexed sender, bool verified);
    event AttackInterceptedOnChain(bytes32 indexed invoiceHash, address indexed attacker);

    constructor(address _verifierAddress) {
        verifierAddress = _verifierAddress;
    }

    function verifyAndProcessEscrow(
        bytes32 invoiceHash,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external returns (bool) {
        // Run verification via compiled Noir verifier contract
        bool isValid = IHonkVerifier(verifierAddress).verify(proof, publicInputs);

        if (!isValid) {
            emit AttackInterceptedOnChain(invoiceHash, msg.sender);
            revert("CustomsEscrow: Invalid ZK Proof! On-chain verification failed.");
        }

        emit ProofSubmitted(invoiceHash, msg.sender, true);
        return true;
    }
}
