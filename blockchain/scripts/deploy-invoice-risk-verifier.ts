import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();

  console.log("Deploying InvoiceRiskHonkVerifier...");

  const verifier = await ethers.deployContract(
    "InvoiceRiskHonkVerifier"
  );

  await verifier.waitForDeployment();

  const address = await verifier.getAddress();

  console.log("InvoiceRiskHonkVerifier deployed to:", address);
  console.log("Network:", await ethers.provider.getNetwork());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
