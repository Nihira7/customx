
"use client";

import { useState } from "react";
import {
  Contract,
  JsonRpcProvider
} from "ethers";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CUSTOMS_CONTRACT_ADDRESS || "";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "http://127.0.0.1:8545";

const ABI = [
  "event CargoCleared(address indexed exporter, string hsCode, uint256 dutyAmount, uint256 timestamp)"
];

type Shipment = {
  exporter: string;
  hsCode: string;
  duty: string;
  timestamp: string;
  transactionHash: string;
};

export default function InspectorPage() {
  const [shipment, setShipment] =
    useState<Shipment | null>(null);

  const [status, setStatus] = useState(
    "No confirmed clearance loaded yet."
  );

  async function loadClearances() {
    try {
      if (!CONTRACT_ADDRESS) {
        throw new Error(
          "Set the contract address in .env.local."
        );
      }

      setStatus("Reading blockchain events...");

      const provider = new JsonRpcProvider(RPC_URL);

      const contract = new Contract(
        CONTRACT_ADDRESS,
        ABI,
        provider
      );

      const events: any[] = await contract.queryFilter(
        contract.filters.CargoCleared(),
        0,
        "latest"
      );

      if (events.length === 0) {
        setShipment(null);
        setStatus(
          "No CargoCleared events found. The shipment has not been cleared on this deployment."
        );
        return;
      }

      const latest: any = events[events.length - 1];
      const args = latest.args;

      setShipment({
        exporter: args[0],
        hsCode: args[1],
        duty: args[2].toString(),
        timestamp: new Date(
          Number(args[3]) * 1000
        ).toLocaleString(),
        transactionHash: latest.transactionHash
      });

      setStatus("Clearance event found on the current chain.");

    } catch (error: any) {
      setStatus(
        error.shortMessage ||
        error.message ||
        "Unable to read the blockchain."
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-blue-700">
            CUSTOMSX
          </p>

          <h1 className="text-3xl font-bold">
            Customs Inspector
          </h1>

          <p className="mt-2 text-slate-600">
            Shipment clearance records from the blockchain.
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Shipment #001
          </h2>

          <button
            onClick={loadClearances}
            className="mt-4 rounded-lg bg-blue-700 px-4 py-3 text-white"
          >
            Refresh Blockchain Status
          </button>

          <p aria-live="polite" className="mt-4">
            {status}
          </p>
        </section>

        {shipment && (
          <section className="space-y-4 rounded-2xl border border-green-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Clearance Record
              </h2>

              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                CLEARED
              </span>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Product
              </p>
              <p className="font-medium">
                Lithium-ion Battery Pack 10kWh
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                HS code
              </p>
              <p className="font-medium">{shipment.hsCode}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Declared duty
              </p>
              <p className="text-2xl font-bold">
                ${shipment.duty}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Exporter
              </p>
              <p className="break-all font-mono text-sm">
                {shipment.exporter}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Recorded at
              </p>
              <p>{shipment.timestamp}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Transaction hash
              </p>
              <p className="break-all font-mono text-sm">
                {shipment.transactionHash}
              </p>
            </div>

            <p className="text-sm text-amber-800">
              This dashboard reads CargoCleared events from the local blockchain. Customs clearance is submitted with a real Noir zero-knowledge proof and verified by the deployed Honk verifier before the clearance event is recorded.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
