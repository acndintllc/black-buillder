import { useState } from "react";
import { ScanLine } from "lucide-react";
import clsx from "clsx";

/**
 * Stand-in for a real decoded-barcode lookup. In the source repo this list was populated
 * by a live camera + barcode decoder; that logic was stripped out during extraction by
 * BUILDER. Only the UI shell and the onScan contract survived the extraction.
 */
const MOCK_SCANS: Array<{ code: string; name: string }> = [
  { code: "012345678905", name: "Organic Blue Agave Syrup 12oz" },
  { code: "049000028911", name: "Coca-Cola Classic 12oz Can" },
  { code: "852696004019", name: "Kirkland Signature Almonds 16oz" },
];

export interface ScanResult {
  code: string;
  name: string;
}

export interface ScannerViewProps {
  /** Called with the scanned item whenever a (simulated) scan completes. */
  onScan: (result: ScanResult) => void;
}

/**
 * ScannerView — extracted from a barcode-scanner reference repo.
 *
 * No real camera or decoding logic here (fixture, not a production component). Clicking
 * "Simulate Scan" cycles through a small mock catalog and reports each item to the parent
 * via `onScan`, which is exactly how the real component reported live decode results.
 */
export function ScannerView({ onScan }: ScannerViewProps) {
  const [scanCount, setScanCount] = useState(0);

  function handleScanClick() {
    const result = MOCK_SCANS[scanCount % MOCK_SCANS.length];
    setScanCount((count) => count + 1);
    onScan(result);
  }

  return (
    <section className={clsx("scanner-view")} aria-label="Barcode scanner">
      <div className="scanner-view__viewfinder">
        <ScanLine size={48} strokeWidth={1.5} />
        <p>Point camera at a barcode</p>
      </div>
      <button type="button" className="scanner-view__button" onClick={handleScanClick}>
        Simulate Scan
      </button>
    </section>
  );
}

export default ScannerView;
