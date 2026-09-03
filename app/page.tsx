import Link from "next/link";

export default function Home() {
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
      </header>

      <h1>A familiar voice when memory needs help.</h1>
      <p className="lead">
        A caregiver enrolls meaningful objects, medicines, and faces so the patient
        can tap once and hear the answer in a trusted voice.
      </p>

      <div className="mode-grid" style={{ marginTop: 24, maxWidth: 640 }}>
        <Link className="btn mode-card" href="/caregiver">
          <span><strong>I&apos;m the caregiver</strong>
            <span className="urdu">میں دیکھ بھال کرنے والا ہوں</span></span>
          <span className="muted">Set up photos, consent, and voice notes.</span>
        </Link>
        <Link className="btn mode-card" href="/patient">
          <span><strong>Show me</strong>
            <span className="urdu">مجھے دکھائیں</span></span>
          <span className="muted">One-tap recall for the patient.</span>
        </Link>
      </div>

      <div className="trust">
        <span className="chip">Camera → CLIP 512</span>
        <span className="chip">Supabase pgvector</span>
        <span className="chip">Caregiver voice</span>
        <span className="chip">Never guesses unknowns</span>
      </div>
    </main>
  );
}