import { fileURLToPath } from "url";
import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "fs";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
describe("InvoiceRiskHonkVerifier - Real Noir Proof", function () {
  this.timeout(180000);
  it("should verify the actual Noir-generated proof", async function () {
    const { ethers } = await network.connect();

    const proofDir = path.resolve(
      __dirname,
      "../../ZK_Response/target/proof"
    );

    const proof =
      "0x" +
      readFileSync(path.join(proofDir, "proof")).toString("hex");

    const publicInputBytes = readFileSync(
      path.join(proofDir, "public_inputs")
    );

    const publicInputs: string[] = [];

    for (let i = 0; i < publicInputBytes.length; i += 32) {
      publicInputs.push(
        "0x" +
          publicInputBytes
            .subarray(i, i + 32)
            .toString("hex")
      );
    }

    expect(publicInputs).to.have.length(3);

    const Verifier = await ethers.getContractFactory(
      "InvoiceRiskHonkVerifier"
    );

    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const result = await verifier.verify(proof, publicInputs);

    expect(result).to.equal(true);
  });
});
