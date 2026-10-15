
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.create();

describe("CustomsEscrow", function () {
  async function deployFixture() {
    const [exporter] = await ethers.getSigners();

    const mockVerifier =
      await ethers.deployContract("MockVerifier");

    await mockVerifier.waitForDeployment();

    const customs = await ethers.deployContract(
      "CustomsEscrow",
      [await mockVerifier.getAddress()]
    );

    await customs.waitForDeployment();

    const rate = ethers.zeroPadValue(
      ethers.toBeHex(5),
      32
    );

    const duty = ethers.zeroPadValue(
      ethers.toBeHex(250),
      32
    );

    const publicInputs = [rate, duty];

    return {
      exporter,
      mockVerifier,
      customs,
      publicInputs
    };
  }

  it("accepts a valid demo proof and emits CargoCleared",
    async function () {
      const {
        exporter,
        customs,
        publicInputs
      } = await deployFixture();

      await expect(
        customs.clearCustoms(
          "0x01",
          publicInputs,
          "8507.60",
          250
        )
      )
        .to.emit(customs, "CargoCleared")
        .withArgs(
          exporter.address,
          "8507.60",
          250,
          (await ethers.provider.getBlock("latest"))!.timestamp + 1
        );

      expect(await customs.dutyAmount()).to.equal(250);
    }
  );

  it("rejects an invalid demo proof", async function () {
    const { customs, publicInputs } =
      await deployFixture();

    await expect(
      customs.clearCustoms(
        "0x00",
        publicInputs,
        "8507.60",
        250
      )
    ).to.be.revertedWith("Invalid ZK proof");
  });

  it("rejects a duty that does not match public inputs",
    async function () {
      const { customs, publicInputs } =
        await deployFixture();

      await expect(
        customs.clearCustoms(
          "0x01",
          publicInputs,
          "8507.60",
          300
        )
      ).to.be.revertedWith(
        "Duty does not match proof inputs"
      );
    }
  );
});