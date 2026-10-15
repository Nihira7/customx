import { network } from "hardhat";
import { readFileSync } from "node:fs";

async function main() {
  const { ethers } = await network.create();

  const verifierAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const escrowAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
  

  const proofPath =
    "C:/Users/Nihira/OneDrive/Documents/integration/CustomX_final/target/proof/proof";

  const inputsPath =
    "C:/Users/Nihira/OneDrive/Documents/integration/CustomX_final/target/proof/public_inputs";

  const proof = "0x" + readFileSync(proofPath).toString("hex");
  const rawInputs = readFileSync(inputsPath);

  if (rawInputs.length !== 64) {
    throw new Error(
      `Expected 64 bytes of public inputs, got ${rawInputs.length}`
    );
  }

  const publicInputs = [
    "0x" + rawInputs.subarray(0, 32).toString("hex"),
    "0x" + rawInputs.subarray(32, 64).toString("hex"),
  ];

  console.log("Proof length:", (proof.length - 2) / 2, "bytes");
  console.log("Public inputs:", publicInputs);

  // Test standalone proof verification
  const verifier = await ethers.getContractAt(
    "HonkVerifier",
    verifierAddress
  );

  const result = await verifier.verify.staticCall(proof, publicInputs);
  console.log("Real Noir proof verification result:", result);
const invalidProof = "0x" + "00".repeat(100);

let invalidProofRejected = false;

try {
  const invalidResult = await verifier.verify.staticCall(
    "0x" + "00".repeat(100),
    publicInputs
  );

  invalidProofRejected = invalidResult === false;
} catch {
  invalidProofRejected = true;
}

if (!invalidProofRejected) {
  throw new Error("FAIL: Invalid proof was accepted");
}

console.log("PASS: Invalid proof was rejected");
  // Test the complete escrow transaction
  const escrow = await ethers.getContractAt(
    "CustomsEscrow",
    escrowAddress
  );

  const tx = await escrow.clearCustoms(
    proof,
    publicInputs,
    "8471",
    250
  );

  const receipt = await tx.wait();

  console.log("Escrow transaction status:", receipt?.status);
  console.log("CustomsEscrow accepted the real proof!");
}

main().catch((error) => {
  console.error("Proof test failed:", error);
  process.exitCode = 1;
});
