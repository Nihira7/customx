"use client";

import { Activity, ArrowRight, Boxes, CheckCircle2, ClipboardList, Info, LockKeyhole, PackageCheck, Send, ShieldCheck, Sparkles, UploadCloud, Wallet } from "lucide-react";

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
    <main className="app-layout">
      <aside className="sidebar"><a href="/" className="brand"><span className="brand-mark"><Boxes size={20}/></span><span className="brand-name">customs<span>x</span><small>TRADE OPERATIONS</small></span></a><div className="side-caption">WORKSPACE</div><nav className="side-nav"><a href="/" className="side-link"><span className="side-icon"><Activity size={17}/></span>Overview</a><a href="/exporter" className="side-link active"><span className="side-icon"><ClipboardList size={17}/></span>Exporter</a><a href="/inspector" className="side-link"><span className="side-icon"><ShieldCheck size={17}/></span>Inspector</a></nav><div className="sidebar-bottom"><div className="sidebar-shield"><ShieldCheck size={17}/></div><div><strong>Secure by design</strong><small>Private data stays protected</small></div></div></aside>
      <section className="main-area"><header className="topbar"><div><span className="topbar-eyebrow">TRADE OPERATIONS / EXPORTER</span><div className="topbar-title">Shipment preparation</div></div><div className="topbar-right"><span className="connection"><i/> Local environment</span><span className="avatar">EX</span></div></header>
      <div className="content-wrap"><div className="page-intro"><div><div className="eyebrow">SHIPMENT WORKFLOW</div><h1>Prepare your <em>shipment.</em></h1><p>Work through each step below. Your summary updates as you enter the details.</p></div><div className="intro-chip"><ShieldCheck size={16}/> Secure processing</div></div>
      <div className="workflow-layout"><div className="workflow-main">
        <section className="workflow-card"><div className="workflow-heading"><span className="workflow-step">01</span><div><h2>Upload commercial invoice</h2><p>Add the invoice PDF to extract the shipment details.</p></div><span className="step-state">START HERE</span></div><label className="drop-area"><input type="file" accept=".pdf,application/pdf" onChange={(e) => setInvoice(e.target.files?.[0] || null)}/><span className="drop-icon"><UploadCloud size={22}/></span><strong>{invoice ? invoice.name : "Choose an invoice PDF"}</strong><small>{invoice ? "File selected · Ready to classify" : "Drag a file here or browse from your device"}</small><span className="browse-link">Browse files</span></label><div className="card-action-row"><span className="field-hint">PDF documents only</span><button onClick={classifyInvoice} className="btn btn-primary"><Sparkles size={16}/> Classify invoice <ArrowRight size={15}/></button></div></section>
        <section className="workflow-card"><div className="workflow-heading"><span className="workflow-step">02</span><div><h2>Review product classification</h2><p>Check the extracted details and make corrections if needed.</p></div><span className="step-state">REVIEW</span></div><label className="field">Product description<input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Enter product description"/></label><div className="form-grid"><label className="field">HS code<input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="e.g. 8507.60"/></label><label className="field">Duty rate (%)<input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Enter rate"/></label></div><div className="inline-hint"><Info size={15}/> AI suggestions should be reviewed before submission.</div></section>
        <section className="workflow-card"><div className="workflow-heading"><span className="workflow-step">03</span><div><h2>Calculate customs duty</h2><p>Enter the declared item cost to calculate the estimated duty.</p></div><span className="step-state">CALCULATE</span></div><label className="field">Declared item cost <span className="field-unit">USD</span><input type="number" min="0" step="1" value={cost} onChange={(e) => { setCost(e.target.value); setProof(""); }} placeholder="Enter item cost"/></label><div className="duty-panel"><div><span className="summary-label">ESTIMATED DUTY PAYABLE</span><strong>${Number.isFinite(duty) ? duty.toFixed(2) : "--"}</strong><small>Based on declared value and applied rate</small></div><div className="duty-rate"><span>APPLIED RATE</span><b>{rate || "0"}%</b></div></div><div className="card-action-row"><span className="field-hint">A real Noir proof is generated using the local proof API.</span><button onClick={generateDemoProof} className="btn btn-soft"><LockKeyhole size={15}/> Generate Noir proof</button></div>{proof && <div className="inline-success"><CheckCircle2 size={17}/><div><strong>Proof generated successfully</strong><small>Proof ready · {publicInputs.length} public inputs</small></div></div>}</section>
        <section className="workflow-card"><div className="workflow-heading"><span className="workflow-step">04</span><div><h2>Submit customs clearance</h2><p>Connect your wallet and confirm the transaction.</p></div><span className="step-state">FINAL STEP</span></div><div className="wallet-row"><span className="wallet-icon"><Wallet size={19}/></span><div className="wallet-copy"><strong>Exporter wallet</strong><small>{wallet ? `${wallet.slice(0, 9)}...${wallet.slice(-7)}` : "No wallet connected yet"}</small></div><button onClick={connectWallet} className="btn btn-outline">{wallet ? <CheckCircle2 size={15}/> : <Wallet size={15}/>} {wallet ? "Connected" : "Connect MetaMask"}</button></div><button onClick={submitClearance} className="btn btn-primary submit-btn"><Send size={16}/> Submit clearance transaction <ArrowRight size={16}/></button><p className="form-footnote">You will be asked to confirm the transaction in MetaMask.</p></section>
        <section aria-live="polite" className={`status-box ${status.toLowerCase().includes("failed") || status.toLowerCase().includes("error") ? "error" : status.toLowerCase().includes("confirmed") || status.toLowerCase().includes("success") ? "success" : ""}`}><Activity size={17}/><div><strong>Process update</strong><span>{status}</span></div></section>
      </div><aside className="summary-column"><section className="summary-card"><div className="summary-card-head"><div><span className="eyebrow">LIVE OVERVIEW</span><h3>Shipment summary</h3></div><span className="summary-live"><i/> LIVE</span></div><div className="summary-product"><span className="summary-product-icon"><PackageCheck size={19}/></span><div><small>PRODUCT</small><strong>{product || "Not provided"}</strong></div></div><div className="summary-list"><div><span>HS code</span><strong>{hsCode || "—"}</strong></div><div><span>Declared value</span><strong>${cost || "0"} USD</strong></div><div><span>Duty rate</span><strong>{rate || "0"}%</strong></div></div><div className="summary-total"><span>Estimated duty</span><strong>${Number.isFinite(duty) ? duty.toFixed(2) : "--"}</strong></div></section><section className="privacy-card"><span className="privacy-icon"><ShieldCheck size={18}/></span><div><strong>Privacy by design</strong><p>The proof workflow verifies the declared duty without publishing private cost details as public inputs.</p></div></section><div className="side-tip"><span className="eyebrow">A QUICK REMINDER</span><p>Review your HS code and duty rate before generating the proof. Classification suggestions are a starting point, not a legal determination.</p></div></aside></div>
      <div className="prototype-note"><LockKeyhole size={15}/> CustomsX prototype · Use test accounts and a local blockchain while developing.</div></div><footer className="footer"><span>© CUSTOMSX</span><span>TRADE, MADE CLEARER</span></footer></section>
    </main>
  );
}
