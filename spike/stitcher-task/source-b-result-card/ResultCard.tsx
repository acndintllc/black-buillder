import { PackageCheck, PackageSearch } from "lucide-react";
import clsx from "clsx";

export interface ScanResult {
  code: string;
  name: string;
}

export interface ResultCardProps {
  /** The most recent scan result, or null when nothing has been scanned yet. */
  result: ScanResult | null;
}

/**
 * ResultCard — extracted from a separate results/receipt-display reference repo.
 *
 * Purely presentational: renders whatever `result` it is given, or an empty/placeholder
 * state when `result` is null. It has no knowledge of scanning and no internal state of
 * its own — the parent app is responsible for feeding it fresh data.
 */
export function ResultCard({ result }: ResultCardProps) {
  if (!result) {
    return (
      <section className={clsx("result-card", "result-card--empty")} aria-label="Scan result">
        <PackageSearch size={32} strokeWidth={1.5} />
        <p>No item scanned yet.</p>
      </section>
    );
  }

  return (
    <section className={clsx("result-card", "result-card--filled")} aria-label="Scan result">
      <PackageCheck size={32} strokeWidth={1.5} />
      <div className="result-card__details">
        <h3 className="result-card__name">{result.name}</h3>
        <p className="result-card__code">Code: {result.code}</p>
      </div>
    </section>
  );
}

export default ResultCard;
