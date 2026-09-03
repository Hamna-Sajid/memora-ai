"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

import {
  analyzeCalibrationMatch,
  type CalibrationOutcome,
} from "@/lib/ai/calibration";
import { embedImage, warmEmbeddingModel } from "@/lib/ai/embeddings";
import { PROVISIONAL_CONFIDENCE_THRESHOLD } from "@/lib/ai/recall";
import { confidenceThresholdForType } from "@/lib/ai/thresholds";
import { matchItem } from "@/lib/supabase/queries";
import { getActivePatientId } from "@/lib/patient-context";

type CalibrationRow = {
  filename: string;
  expected: string;
  matched: string;
  score: number | null;
  outcome: CalibrationOutcome | "error";
};

const outcomeText: Record<CalibrationRow["outcome"], string> = {
  "correct-match": "Correct confident match",
  "correct-rejection": "Correct not-sure response",
  "missed-known": "Known item missed",
  "wrong-confident-match": "Unsafe confident match",
  error: "Processing error",
};

export default function CalibrationPage() {
  const [status, setStatus] = useState("Loading recognition model…");
  const [expectedLabel, setExpectedLabel] = useState("Suduri");
  const [unknown, setUnknown] = useState(false);
  const [rows, setRows] = useState<CalibrationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const activePatientId = getActivePatientId();
    if (!activePatientId) {
      void Promise.resolve().then(() => {
        if (active) {
          setPatientId(null);
          setStatus("Select a patient in caregiver mode before calibrating.");
        }
      });
      return () => {
        active = false;
      };
    }
    void Promise.resolve().then(() => {
      if (active) setPatientId(activePatientId);
    });
    void warmEmbeddingModel()
      .then(() => {
        if (active) setStatus("Ready for calibration photos.");
      })
      .catch(() => {
        if (active) setStatus("Recognition model unavailable — reload to retry.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function processFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || busy) return;
    if (!patientId) {
      setStatus("Select a patient in caregiver mode before calibrating.");
      return;
    }
    if (!unknown && !expectedLabel.trim()) {
      setStatus("Enter the enrolled label for known-item photos.");
      return;
    }

    setBusy(true);
    setStatus(`Processing ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    const nextRows: CalibrationRow[] = [];

    for (const file of files) {
      try {
        const embedding = await embedImage(file);
        const match = await matchItem(embedding, patientId);
        const decision = analyzeCalibrationMatch(
          unknown ? null : expectedLabel,
          match,
          match
            ? confidenceThresholdForType(match.item.type)
            : PROVISIONAL_CONFIDENCE_THRESHOLD,
        );
        nextRows.push({
          filename: file.name,
          expected: decision.expectedLabel ?? "Unknown",
          matched: decision.matchedLabel ?? "No match",
          score: decision.score,
          outcome: decision.outcome,
        });
      } catch {
        nextRows.push({
          filename: file.name,
          expected: unknown ? "Unknown" : expectedLabel.trim(),
          matched: "—",
          score: null,
          outcome: "error",
        });
      }
    }

    setRows((current) => [...current, ...nextRows]);
    setStatus("Calibration batch complete.");
    setBusy(false);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">M</span><span>Calibration</span></div>
        <Link className="btn" href="/patient">Patient mode</Link>
      </header>

      <div className="stack">
        <section className="card">
          <h2>Recognition score calibration</h2>
          <p className="muted">
            Internal test screen. Use held-out photos that were not enrolled. The default provisional threshold is {PROVISIONAL_CONFIDENCE_THRESHOLD.toFixed(2)}; calibrated type policies are applied automatically.
          </p>
          <div className="fields">
            <label>
              Expected enrolled label
              <input
                value={expectedLabel}
                onChange={(event) => setExpectedLabel(event.target.value)}
                disabled={unknown || busy}
              />
            </label>
            <label className="row" style={{ alignContent: "center" }}>
              <input
                type="checkbox"
                checked={unknown}
                onChange={(event) => setUnknown(event.target.checked)}
                disabled={busy}
                style={{ width: "auto", minHeight: "auto" }}
              />
              These photos show objects not enrolled anywhere
            </label>
            <small className="span">
              Do not select this for a different enrolled item. Enter that
              item&apos;s actual label and test it as a known item instead.
            </small>
            <label className="span">
              Select one or more query photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={processFiles}
                disabled={busy}
              />
            </label>
          </div>
          <p className="status" aria-live="polite">{status}</p>
          <button onClick={() => setRows([])} disabled={busy || rows.length === 0}>
            Clear results
          </button>
        </section>

        {rows.length > 0 && (
          <section className="card" style={{ overflowX: "auto" }}>
            <table className="calibration-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Expected</th>
                  <th>Nearest item</th>
                  <th>Score</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.filename}-${index}`}>
                    <td>{row.filename}</td>
                    <td>{row.expected}</td>
                    <td>{row.matched}</td>
                    <td>{row.score === null ? "—" : row.score.toFixed(4)}</td>
                    <td>{outcomeText[row.outcome]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
