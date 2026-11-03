import { ethers } from "hardhat";

async function main() {
  console.log("[ZK_Response] Initializing On-Chain Proof Defense Test...");

  const CustomsEscrow = await ethers.getContractFactory("CustomsEscrow");
  // Assuming verifier address
  const verifierAddress = "0x0000000000000000000000000000000000000000"; 
  const escrow = await CustomsEscrow.deploy(verifierAddress);
  await escrow.waitForDeployment();

  console.log(`[ZK_Response] CustomsEscrow deployed to: ${await escrow.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
