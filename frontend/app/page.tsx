
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <p className="font-semibold text-blue-700">
          CUSTOMSX
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Cross-Border Trade Compliance
        </h1>

        <p className="mt-3 text-slate-600">
          AI-assisted tariff classification and
          blockchain-based customs clearance.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/exporter"
            className="rounded-lg bg-blue-700 px-5 py-3 text-white"
          >
            Exporter Dashboard
          </Link>

          <Link
            href="/inspector"
            className="rounded-lg bg-slate-800 px-5 py-3 text-white"
          >
            Inspector Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
