
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();

  console.log("Deploying HonkVerifier...");

  const verifier = await ethers.deployContract("HonkVerifier");
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  console.log("HonkVerifier deployed to:", verifierAddress);

  console.log("Deploying CustomsEscrow...");

  const escrow = await ethers.deployContract("CustomsEscrow", [
    verifierAddress,
  ]);
  await escrow.waitForDeployment();

  console.log("CustomsEscrow deployed to:", await escrow.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
