
import { buildModule } from
  "@nomicfoundation/hardhat-ignition/modules";

const CustomsXModule = buildModule(
  "CustomsXModule",
  (m) => {
    const mockVerifier = m.contract("MockVerifier");

    const customsEscrow = m.contract(
      "CustomsEscrow",
      [mockVerifier]
    );

    return {
      mockVerifier,
      customsEscrow
    };
  }
);

export default CustomsXModule;