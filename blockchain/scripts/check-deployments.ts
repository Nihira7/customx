import { JsonRpcProvider } from "ethers";

async function main() {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");

  const addresses = [
    ["CustomsEscrow", "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"],
    ["HonkVerifier", "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"],
  ];

  for (const [name, address] of addresses) {
    const code = await provider.getCode(address);
    console.log(
      `${name}: ${code === "0x" ? "NO CONTRACT" : "CONTRACT DEPLOYED"}`
    );
  }

  await provider.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
