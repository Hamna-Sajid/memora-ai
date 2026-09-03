"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startCamera, capturePhoto } from "@/lib/camera";
import { getExtractor } from "@/lib/ai/embeddings";
import { recall } from "@/lib/ai/recall";

type Item = { label: string; note_text: string; audio_url: string };

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Warming up…");
  const [result, setResult] = useState<Item | null>(null);
  const [notSure, setNotSure] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { await getExtractor(); } catch { /* model warm best-effort */ }
      if (videoRef.current) {
        try { await startCamera(videoRef.current); }
        catch { setStatus("Camera blocked — allow camera access."); return; }
      }
      setStatus("Ready. Tap the button.");
    })();
  }, []);

  async function onTap() {
    if (busy || !videoRef.current) return;
    setBusy(true);
    setResult(null);
    setNotSure(false);
    setStatus("Looking…");
    try {
      const blob = await capturePhoto(videoRef.current);
      const r = await recall(blob);
      if (r.notSure) {
        setNotSure(true);
      } else {
        setResult(r.item as Item);
        if (r.item.audio_url) {
          new Audio(r.item.audio_url).play().catch(() => { /* autoplay guarded by tap */ });
        }
      }
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
    setStatus("Ready. Tap again.");
    setBusy(false);
  }

  return (
    <main className="app">
      <div className="phone">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Memora</strong>
          <Link className="btn" href="/caregiver">Setup</Link>
        </div>

        <div className="camera"><video ref={videoRef} playsInline muted /></div>

        <p className="status">{status}</p>

        <button className="primary big-question" onClick={onTap} disabled={busy}>
          <span>What is this?</span>
          <span className="urdu">یہ کیا ہے؟</span>
        </button>

        <div className="result">
          {!result && !notSure && (
            <>
              <strong>Ready</strong>
              <p>Point the phone and tap once.</p>
              <p className="urdu">فون سامنے کریں اور ایک بار دبائیں۔</p>
            </>
          )}
          {notSure && (
            <>
              <strong>I&apos;m not sure.</strong>
              <p>Shall I call your caregiver?</p>
              <a className="btn primary" href="tel:+920000000000">Call caregiver</a>
            </>
          )}
          {result && (
            <>
              <strong>{result.label}</strong>
              <p>{result.note_text}</p>
              <small>Playing caregiver voice…</small>
            </>
          )}
        </div>
      </div>
    </main>
  );
}