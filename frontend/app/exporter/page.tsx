
"use client";

import { useState } from "react";
import {
  BrowserProvider,
  Contract,
  zeroPadValue,
  toBeHex
} from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CUSTOMS_CONTRACT_ADDRESS || "";


console.log(
  "CustomsX contract address loaded:",
  process.env.NEXT_PUBLIC_CUSTOMS_CONTRACT_ADDRESS
);

const AI_URL =
  process.env.NEXT_PUBLIC_AI_API_URL ||
  "http://127.0.0.1:8000";

const ABI = [
  "function clearCustoms(bytes proof, bytes32[] publicInputs, string hsCode, uint256 _dutyAmount)",
  "function dutyAmount() view returns (uint256)",
  "event CargoCleared(address indexed exporter, string hsCode, uint256 dutyAmount, uint256 timestamp)"
];

export default function ExporterPage() {
  const [invoice, setInvoice] = useState<File | null>(null);
  const [product, setProduct] = useState(
    "Lithium-ion Battery Pack 10kWh"
  );
  const [hsCode, setHsCode] = useState("8507.60");
  const [rate, setRate] = useState("5");
  const [cost, setCost] = useState("5000");
  const [wallet, setWallet] = useState("");
  const [proof, setProof] = useState("");
  const [publicInputs, setPublicInputs] = useState<string[]>([]);
  const [status, setStatus] = useState(
    "Upload an invoice to begin."
  );

  const [riskInvoice, setRiskInvoice] = useState({
    invoice_id: "INV-DEMO-001",
    supplier: "Demo Supplier",
    product_description: "Metal Office Desk",
    declared_hs_code: "9403.20",
    quantity: "2",
    unit_price: "1000",
    total: "2000",
    currency: "USD",
    origin: "Germany",
  });
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  function updateRiskInvoice(field: string, value: string) {
    setRiskInvoice((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function analyzeRiskInvoice() {
    setAnalysisLoading(true);
    setAnalysisResult(null);
    setStatus("Running Defender, risk scoring and ZK checks...");

    try {
      const response = await fetch(`${AI_URL}/analyze-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...riskInvoice,
          quantity: Number(riskInvoice.quantity),
          unit_price: Number(riskInvoice.unit_price),
          total: Number(riskInvoice.total),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "Invoice analysis failed."
        );
      }

      setAnalysisResult(result);
      setStatus("Invoice risk analysis completed.");
    } catch (error) {
      setStatus(
        `Analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  const duty =
    Number(cost) * Number(rate) / 100;

  async function classifyInvoice() {
    if (!invoice) {
      setStatus("Please select an invoice PDF.");
      return;
    }

    try {
      setStatus("Sending invoice to AI...");

      const form = new FormData();
      form.append("file", invoice);

      const response = await fetch(
        `${AI_URL}/classify-pdf`,
        {
          method: "POST",
          body: form
        }
      );

      if (!response.ok) {
        throw new Error(
          `AI API returned HTTP ${response.status}`
        );
      }

      const result = await response.json();
      console.log("AI Classification result:",result)

      if (result.product) setProduct(result.product);
      if (result.hs_code) setHsCode(result.hs_code);
      if (result.duty_rate != null) {
        setRate(String(result.duty_rate));
      }

      setStatus("AI classification received.");
    } catch (error) {
      setStatus(
        "AI request failed. Check that Person 1's API is running and confirm its upload format."
      );
    }
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        throw new Error("Install MetaMask first.");
      }

      const provider =
        new BrowserProvider(window.ethereum);

      await provider.send(
        "eth_requestAccounts",
        []
      );

      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setWallet(address);
      setStatus("Wallet connected.");

    } catch (error: any) {
      setStatus(error.message || "Wallet connection failed.");
    }
  }

  async function generateDemoProof() {
  if (
    !Number.isFinite(duty) ||
    duty < 0 ||
    !Number.isInteger(duty) ||
    !Number.isInteger(Number(cost)) ||
    Number(cost) <= 0 ||
    !Number.isInteger(Number(rate)) ||
    Number(rate) < 0 ||
    Number(rate) > 100
  ) {
    setStatus(
      "Enter a positive whole-number item cost and a duty rate from 0 to 100."
    );
    return;
  }

  setProof("");
  setPublicInputs([]);
  setStatus("Generating a real Noir proof. This may take a few minutes...");

  try {
    const response = await fetch(`${AI_URL}/generate-proof`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_cost: Number(cost),
        duty_rate_percent: Number(rate),
        declared_duty: duty,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : "The proof-generation API returned an error."
      );
    }

    if (
      typeof result.proof !== "string" ||
      !result.proof.startsWith("0x") ||
      !Array.isArray(result.publicInputs) ||
      result.publicInputs.length !== 2
    ) {
      throw new Error("The API returned an unexpected proof format.");
    }

    setProof(result.proof);
    setPublicInputs(result.publicInputs);

    setStatus(
      `Real Noir proof generated successfully. Calculated duty: $${duty}.`
    );
  } catch (error) {
    setStatus(
      `Proof generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

  async function submitClearance() {
  try {
    if (!window.ethereum) {
      throw new Error("Install MetaMask first.");
    }

    if (!CONTRACT_ADDRESS) {
      throw new Error("CustomsX contract address is missing.");
    }

    if (!proof || publicInputs.length !== 2) {
      throw new Error(
        "Generate a real Noir proof before submitting clearance."
      );
    }

    if (
      !Number.isInteger(duty) ||
      duty < 0
    ) {
      throw new Error(
        "Duty must be a non-negative whole number."
      );
    }

      const provider =
        new BrowserProvider(window.ethereum);

      const network = await provider.getNetwork();

      if (
        Number(network.chainId) !==
        Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337)
      ) {
        throw new Error(
          "Switch MetaMask to CustomsX Local (chain ID 31337)."
        );
      }

      const signer = await provider.getSigner();
      const contract = new Contract(
        CONTRACT_ADDRESS,
        ABI,
        signer
      );


      setStatus("Waiting for wallet confirmation...");

      const tx = await contract.clearCustoms(
        proof,
        publicInputs,
        hsCode,
        duty
      );

      setStatus(`Transaction sent: ${tx.hash}`);

      await tx.wait();

      setStatus(`Customs clearance confirmed on the local blockchain. Transaction: ${tx.hash}`);

    } catch (error: any) {
      setStatus(
        error.shortMessage ||
        error.reason ||
        error.message ||
        "Clearance failed."
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
            Exporter Dashboard
          </h1>

          <p className="mt-2 text-slate-600">
            Invoice classification and customs clearance.
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">
            1. Upload invoice
          </h2>

          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) =>
              setInvoice(e.target.files?.[0] || null)
            }
            className="block w-full rounded-lg border p-3"
          />

          <button
            onClick={classifyInvoice}
            className="rounded-lg bg-blue-700 px-4 py-3 text-white"
          >
            Classify Invoice with AI
          </button>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">
            2. AI classification
          </h2>

          <label className="block">
            Product
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            HS code
            <input
              value={hsCode}
              onChange={(e) => setHsCode(e.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            Duty rate (%)
            <input
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">
            Risk & ZK Verification
          </h2>
          <p className="text-sm text-slate-600">
            Submit invoice details for Defender analysis, risk scoring and
            real proof eligibility checks.
          </p>

          {([
            ["invoice_id", "Invoice ID"],
            ["supplier", "Supplier"],
            ["product_description", "Product description"],
            ["declared_hs_code", "Declared HS code"],
            ["quantity", "Quantity"],
            ["unit_price", "Unit price"],
            ["total", "Invoice total"],
            ["currency", "Currency"],
            ["origin", "Country of origin"],
          ] as const).map(([field, label]) => (
            <label key={field} className="block text-sm font-medium">
              {label}
              <input
                type={field === "quantity" ? "number" : field === "unit_price" || field === "total" ? "number" : "text"}
                min={field === "quantity" || field === "unit_price" || field === "total" ? "0" : undefined}
                step={field === "quantity" ? "1" : field === "unit_price" || field === "total" ? "any" : undefined}
                value={riskInvoice[field]}
                onChange={(event) => updateRiskInvoice(field, event.target.value)}
                className="mt-1 w-full rounded-lg border p-3"
              />
            </label>
          ))}

          <button
            onClick={analyzeRiskInvoice}
            disabled={analysisLoading}
            className="w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {analysisLoading ? "Analyzing invoice..." : "Run Defender & ZK Analysis"}
          </button>
        </section>

        {analysisResult && (
          <section className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Analysis Results</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Risk score</p>
                <p className="text-3xl font-bold">
                  {analysisResult.risk_assessment?.risk_score ?? "N/A"}
                </p>
              </div>
              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Final decision</p>
                <p className="text-2xl font-bold">
                  {analysisResult.risk_assessment?.final_action ?? "N/A"}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold">Defender analysis</h3>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-green-300">
                {JSON.stringify(analysisResult.defender_analysis, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold">Risk factors</h3>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                {(analysisResult.risk_assessment?.risk_factors || []).length
                  ? analysisResult.risk_assessment.risk_factors.map((factor: string, index: number) => (
                      <li key={index}>{factor}</li>
                    ))
                  : <li>No risk factors reported.</li>}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold">Zero-knowledge proof</h3>
              <p className="mt-2 text-sm">
                Status: <strong>{analysisResult.zk_proof?.status || "Unknown"}</strong>
              </p>
              <p className="text-sm">
                Proof generated: <strong>{analysisResult.zk_proof?.proof_generated ? "Yes" : "No"}</strong>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {analysisResult.zk_proof?.message || "No additional proof message."}
              </p>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">
            3. Duty calculation
          </h2>

          <label className="block">
            Private factory cost ($)
            <input
              type="number"
              min="0"
              step="1"
              value={cost}
              onChange={(e) => {
                setCost(e.target.value);
                setProof("");
              }}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>

          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-sm text-slate-600">
              Calculated duty
            </p>

            <p className="text-3xl font-bold">
              ${Number.isFinite(duty) ? duty.toFixed(2) : "--"}
            </p>
          </div>

          <button
            onClick={generateDemoProof}
            className="rounded-lg bg-slate-800 px-4 py-3 text-white"
          >
            Generate Real Noir Proof
          </button>

          <p className="text-sm text-amber-800">
            Real Noir proof generation uses the local proof API.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">
            4. Submit clearance
          </h2>

          <button
            onClick={connectWallet}
            className="rounded-lg border px-4 py-3"
          >
            {wallet
              ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
              : "Connect MetaMask"}
          </button>

          <button
            onClick={submitClearance}
            className="block w-full rounded-lg bg-green-700 px-4 py-3 text-white"
          >
            Submit Clearance Transaction
          </button>
        </section>

        <section
          aria-live="polite"
          className="break-words rounded-xl border border-blue-200 bg-blue-50 p-4"
        >
          <h2 className="font-semibold">Status</h2>
          <p className="mt-1">{status}</p>
        </section>

        <footer className="text-sm text-slate-500">
          CustomsX prototype — use test accounts and a local
          blockchain while developing.
        </footer>
      </div>
    </main>
  );
}
