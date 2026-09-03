"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startCamera, capturePhoto } from "@/lib/camera";
import { embedImage } from "@/lib/ai/embeddings";
import { saveItem, uploadFile, saveConsent } from "@/lib/supabase/queries";
import VoiceRecorder from "@/components/VoiceRecorder";

export default function CaregiverPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [consented, setConsented] = useState(false);
  const [name, setName] = useState("Ayesha");
  const [agree, setAgree] = useState(false);

  const [photos, setPhotos] = useState<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [label, setLabel] = useState("Heart medicine");
  const [type, setType] = useState("med");
  const [language, setLanguage] = useState("en");
  const [note, setNote] = useState("heart medicine, one at breakfast");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // start the camera once consent is given
  useEffect(() => {
    if (consented && videoRef.current) {
      startCamera(videoRef.current).catch((e) => setStatus("Camera error: " + e.message));
    }
  }, [consented]);

  async function doConsent() {
    if (!name.trim() || !agree) { setStatus("Enter the name and tick consent."); return; }
    try { await saveConsent(name.trim()); } catch { /* non-blocking for demo */ }
    setStatus("");
    setConsented(true);
  }

  async function addPhoto() {
    if (!videoRef.current) return;
    const blob = await capturePhoto(videoRef.current);
    setPhotos((p) => [...p, blob].slice(0, 5));
  }

  async function save() {
    if (photos.length < 3) { setStatus("Add at least 3 photos."); return; }
    if (!audioUrl) { setStatus("Record a voice note first."); return; }
    setSaving(true);
    try {
      setStatus("Making photo fingerprints…");
      const vectors: number[][] = [];
      const photo_urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        vectors.push(await embedImage(photos[i]));
        photo_urls.push(await uploadFile("photos", photos[i], `p-${Date.now()}-${i}.jpg`));
      }

      setStatus("Warming the note…");
      let warm = note;
      try {
        const r = await fetch("/api/warm-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note, caregiverName: name, language }),
        });
        warm = (await r.json()).warm || note;
      } catch { /* fall back to raw note */ }

      setStatus("Saving…");
      await saveItem({
        label, type, note_raw: note, note_text: warm,
        audio_url: audioUrl, language, vectors, photo_urls,
      });

      setStatus("Saved ✓ This item is now recognisable in patient mode.");
      setPhotos([]); setAudioUrl("");
    } catch (e: any) {
      setStatus("Error: " + (e.message || String(e)));
    }
    setSaving(false);
  }

  // ---------- Consent screen ----------
  if (!consented) {
    return (
      <main className="app">
        <header className="topbar">
          <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
          <Link className="btn" href="/">Home</Link>
        </header>
        <div className="card" style={{ maxWidth: 560 }}>
          <h2>Voice consent</h2>
          <p>Memora uses the caregiver&apos;s recorded voice only to help the patient recognise familiar things. It never says the caregiver is physically present.</p>
          <label className="span">Caregiver name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="span row" style={{ alignItems: "flex-start", marginTop: 12, fontWeight: 600 }}>
            <input type="checkbox" style={{ width: "auto", minHeight: "auto", marginTop: 5 }}
              checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I consent to use my recorded voice only for this patient&apos;s memory support.</span>
          </label>
          {status && <div className="alert" style={{ marginTop: 12 }}>{status}</div>}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" onClick={doConsent}>Continue to enrollment</button>
          </div>
        </div>
      </main>
    );
  }

  // ---------- Enrollment screen ----------
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
        <div className="row">
          <Link className="btn" href="/">Home</Link>
          <Link className="btn primary" href="/patient">Open patient</Link>
        </div>
      </header>

      <div className="layout">
        <div className="stack">
          <div className="card">
            <h2>Caregiver enrollment</h2>
            <p className="muted">Take 3–5 photos, record one short note, add details, then Save.</p>
          </div>

          <div className="card">
            <h3>1. Photos <span className="urdu">تصاویر</span></h3>
            <div className="camera"><video ref={videoRef} playsInline muted /></div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="soft" onClick={addPhoto}>Add photo ({photos.length}/5)</button>
              <button onClick={() => setPhotos([])}>Clear</button>
            </div>
            <div className="thumbs">
              {photos.map((b, i) => (
                <div className="thumb" key={i}><img src={URL.createObjectURL(b)} alt={`photo ${i + 1}`} /></div>
              ))}
            </div>
            <small>3–5 angles improve matching.</small>
          </div>

          <div className="card">
            <h3>2. Voice note <span className="urdu">آواز</span></h3>
            <VoiceRecorder onSaved={setAudioUrl} />
            {audioUrl && <div className="success" style={{ marginTop: 10 }}>Voice note saved ✓</div>}
          </div>

          <div className="card">
            <h3>3. Details</h3>
            <div className="fields">
              <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
              <label>Type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="med">Medicine</option>
                  <option value="object">Object</option>
                  <option value="face">Face</option>
                </select>
              </label>
              <label>Language
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </select>
              </label>
              <label className="span">Caregiver note
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            {status && <div className="success" style={{ marginTop: 12 }}>{status}</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save item"}
              </button>
            </div>
          </div>
        </div>

        <aside className="card">
          <h3>Tips</h3>
          <p className="muted">Good light and 3–5 clear angles make recall reliable. Keep the voice note short.</p>
          <p className="muted">Only your team&apos;s own faces/voices in the demo — no real patient data.</p>
        </aside>
      </div>
    </main>
  );
}