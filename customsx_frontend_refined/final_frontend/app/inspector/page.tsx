"use client";

import { useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { Activity, Boxes, CheckCircle2, ClipboardCheck, ExternalLink, Globe2, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CUSTOMS_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

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
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [status, setStatus] = useState("No confirmed clearances loaded yet.");
  const [loading, setLoading] = useState(false);

  async function loadClearances() {
    try {
      if (!CONTRACT_ADDRESS) throw new Error("Set the contract address in .env.local.");
      setLoading(true);
      setStatus("Reading blockchain events...");
      const provider = new JsonRpcProvider(RPC_URL);
      const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
      const events: any[] = await contract.queryFilter(contract.filters.CargoCleared(), 0, "latest");
      const records: Shipment[] = events.map((event: any) => ({
        exporter: event.args[0],
        hsCode: event.args[1],
        duty: event.args[2].toString(),
        timestamp: new Date(Number(event.args[3]) * 1000).toLocaleString(),
        transactionHash: event.transactionHash
      }));
      setShipments(records);
      setStatus(records.length === 0
        ? "No CargoCleared events found on this deployment."
        : `Found ${records.length} clearance record(s) on the current chain.`);
    } catch (error: any) {
      setStatus(error.shortMessage || error.message || "Unable to read the blockchain.");
    } finally {
      setLoading(false);
    }
  }

  const totalDuty = shipments.reduce((sum, item) => sum + Number(item.duty), 0);

  return (
    <main className="app-layout"><aside className="sidebar"><a href="/" className="brand"><span className="brand-mark"><Boxes size={20}/></span><span className="brand-name">customs<span>x</span><small>TRADE OPERATIONS</small></span></a><div className="side-caption">WORKSPACE</div><nav className="side-nav"><a href="/" className="side-link"><span className="side-icon"><Activity size={17}/></span>Overview</a><a href="/exporter" className="side-link"><span className="side-icon"><ClipboardCheck size={17}/></span>Exporter</a><a href="/inspector" className="side-link active"><span className="side-icon"><ShieldCheck size={17}/></span>Inspector</a></nav><div className="sidebar-bottom"><div className="sidebar-shield"><ShieldCheck size={17}/></div><div><strong>Secure by design</strong><small>Records you can verify</small></div></div></aside>
    <section className="main-area"><header className="topbar"><div><span className="topbar-eyebrow">TRADE OPERATIONS / INSPECTOR</span><div className="topbar-title">Clearance monitoring</div></div><div className="topbar-right"><span className="connection"><i/> Local environment</span><span className="avatar">IN</span></div></header><div className="content-wrap"><div className="page-intro"><div><div className="eyebrow">BLOCKCHAIN RECORDS</div><h1>Every clearance,<br/><em>clearly accounted for.</em></h1><p>Review confirmed shipment activity retrieved from the CustomsX contract.</p></div><button onClick={loadClearances} disabled={loading} className="btn btn-primary refresh-btn"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Refreshing..." : "Refresh records"}</button></div>
    <div className="inspector-stats"><div className="stat-card"><span className="stat-icon"><PackageCheck size={18}/></span><span className="summary-label">CONFIRMED SHIPMENTS</span><strong>{shipments.length}</strong><small>On the current chain</small></div><div className="stat-card"><span className="stat-icon mint"><Globe2 size={18}/></span><span className="summary-label">TOTAL DECLARED DUTY</span><strong>${totalDuty.toLocaleString()}</strong><small>Sum of recorded duty amounts</small></div><div className="stat-card"><span className="stat-icon pale"><Activity size={18}/></span><span className="summary-label">NETWORK</span><strong className="network-stat"><i/> Local RPC</strong><small>Connects when records load</small></div></div>
    <section className="records-panel"><div className="records-head"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Shipment history</h2><p>Event records retrieved from the CustomsX contract.</p></div><span className="record-count">{shipments.length} {shipments.length === 1 ? "record" : "records"}</span></div><div aria-live="polite" className={`status-box ${status.toLowerCase().includes("unable") || status.toLowerCase().includes("error") || status.toLowerCase().includes("set the") ? "error" : status.startsWith("Found") ? "success" : ""}`}><Activity size={16}/><span>{status}</span></div>
    {shipments.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={24}/></div><h3>No clearance records yet</h3><p>Once a shipment is confirmed, its blockchain record will appear here.</p><button onClick={loadClearances} disabled={loading} className="btn btn-soft">{loading ? "Checking..." : "Check blockchain"}</button></div> : <div className="record-list">{shipments.map((shipment, index) => <article key={shipment.transactionHash} className="shipment-record"><div className="shipment-record-top"><div className="shipment-id"><span className="record-number">{String(index + 1).padStart(2, "0")}</span><div><small>CLEARANCE RECORD</small><strong>Shipment #{String(index + 1).padStart(3, "0")}</strong></div></div><span className="cleared-pill"><CheckCircle2 size={13}/> CLEARED</span></div><div className="shipment-details"><div><span>HS CODE</span><strong>{shipment.hsCode}</strong></div><div><span>DECLARED DUTY</span><strong className="duty-blue">${shipment.duty}</strong></div><div><span>EXPORTER WALLET</span><strong className="hash">{shipment.exporter}</strong></div><div><span>RECORDED AT</span><strong>{shipment.timestamp}</strong></div></div><div className="transaction-row"><div><span>TRANSACTION HASH</span><strong className="hash">{shipment.transactionHash}</strong></div><a aria-label="View transaction" href={`https://etherscan.io/tx/${shipment.transactionHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/> View transaction</a></div></article>)}</div>}</section><div className="prototype-note"><ShieldCheck size={15}/> Records are read from the configured contract deployment. Confirm the selected network before relying on this prototype data.</div></div><footer className="footer"><span>© CUSTOMSX</span><span>TRADE, MADE CLEARER</span></footer></section></main>
  );
}
