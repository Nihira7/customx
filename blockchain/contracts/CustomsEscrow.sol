
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INoirVerifier {
    function verify(
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external view returns (bool);
}

contract CustomsEscrow {
    INoirVerifier public immutable verifier;

    // Latest successfully cleared shipment's duty.
    uint256 public dutyAmount;

    event CargoCleared(
        address indexed exporter,
        string hsCode,
        uint256 dutyAmount,
        uint256 timestamp
    );

    constructor(address verifierAddress) {
        require(
            verifierAddress != address(0),
            "Invalid verifier address"
        );

        verifier = INoirVerifier(verifierAddress);
    }

    function clearCustoms(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        string calldata hsCode,
        uint256 _dutyAmount
    ) external {
        require(
            publicInputs.length >= 2,
            "Missing public inputs"
        );

        // Agreed demo input order:
        // publicInputs[0] = duty rate (5)
        // publicInputs[1] = declared duty (250)
        require(
            uint256(publicInputs[1]) == _dutyAmount,
            "Duty does not match proof inputs"
        );

        require(
            verifier.verify(proof, publicInputs),
            "Invalid ZK proof"
        );

        dutyAmount = _dutyAmount;

        emit CargoCleared(
            msg.sender,
            hsCode,
            _dutyAmount,
            block.timestamp
        );
    }
}