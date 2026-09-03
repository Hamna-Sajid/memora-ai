"use client";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { startCamera, capturePhoto } from "@/lib/camera";
import { embedImage, warmEmbeddingModel } from "@/lib/ai/embeddings";
import type { ItemLanguage, ItemType } from "@/lib/ai/types";
import { hasVoiceConsent, saveItem, uploadFile, saveConsent } from "@/lib/supabase/queries";
import VoiceRecorder from "@/components/VoiceRecorder";
import { clearActivePatientId, getActivePatientId, setActivePatientId } from "@/lib/patient-context";
import { currentUser, signOut } from "@/lib/supabase/auth";
import {
  createCaregiverInvitation,
  createPairingToken,
  createPatient,
  deletePatient,
  getCaregiverRole,
  listPatientCaregivers,
  listPatientDevices,
  listAccessiblePatients,
  revokePatientDevice,
  type CaregiverMember,
  type Patient,
  type PatientDevice,
} from "@/lib/supabase/patients";

function PhotoThumbnail({ photo, index }: { photo: Blob; index: number }) {
  const [source] = useState(() => URL.createObjectURL(photo));

  useEffect(() => {
    return () => URL.revokeObjectURL(source);
  }, [source]);

  return (
    <div className="thumb">
      <Image
        src={source}
        alt={`photo ${index + 1}`}
        width={96}
        height={96}
        unoptimized
      />
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : fallback;
}

export default function CaregiverPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [caregiverId, setCaregiverId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedRole, setSelectedRole] = useState<CaregiverMember["role"] | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientLanguage, setPatientLanguage] = useState<"en" | "ur">("en");
  const [pairingUrl, setPairingUrl] = useState("");
  const [devices, setDevices] = useState<PatientDevice[]>([]);
  const [members, setMembers] = useState<CaregiverMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [consented, setConsented] = useState(false);
  const [name, setName] = useState("Ayesha");
  const [agree, setAgree] = useState(false);

  const [photos, setPhotos] = useState<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ItemType>("object");
  const [language, setLanguage] = useState<ItemLanguage>("en");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const user = await currentUser();
      if (!active) return;
      if (!user || user.is_anonymous) {
        router.replace("/auth");
        return;
      }

      const accessiblePatients = await listAccessiblePatients();
      if (!active) return;
      setCaregiverId(user.id);
      if (typeof user.user_metadata.display_name === "string") {
        setName(user.user_metadata.display_name);
      }
      setPatients(accessiblePatients);
      const rememberedId = getActivePatientId();
      const remembered = accessiblePatients.find(
        (patient) => patient.id === rememberedId,
      );
      if (remembered) {
        const [existingConsent, role] = await Promise.all([
          hasVoiceConsent(remembered.id, user.id),
          getCaregiverRole(remembered.id, user.id),
        ]);
        setSelectedPatient(remembered);
        setSelectedRole(role);
        setConsented(existingConsent);
        setLanguage(remembered.preferredLanguage);
      }
      setAuthLoading(false);
    })().catch((error: unknown) => {
      if (!active) return;
      setStatus(error instanceof Error ? error.message : "Could not load caregiver account.");
      setAuthLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!consented || !videoRef.current) return;

    let active = true;
    let stream: MediaStream | null = null;
    void startCamera(videoRef.current)
      .then((cameraStream) => {
        stream = cameraStream;
        if (active) setCameraReady(true);
        if (!active) stream.getTracks().forEach((track) => track.stop());
      })
      .catch(() => {
        if (active) {
          setCameraReady(false);
          setStatus("No camera is available. Choose 3–5 image files below.");
        }
      });
    void warmEmbeddingModel().catch(() => {
      if (active) setStatus("Recognition model unavailable — reload to retry.");
    });

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [consented]);

  useEffect(() => {
    if (!selectedPatient) return;
    let active = true;
    void Promise.all([
      listPatientDevices(selectedPatient.id),
      listPatientCaregivers(selectedPatient.id),
    ]).then(([patientDevices, patientMembers]) => {
      if (!active) return;
      setDevices(patientDevices);
      setMembers(patientMembers);
    }).catch((error: unknown) => {
      if (!active) return;
      setStatus(errorMessage(error, "Patient access details could not be loaded."));
    });
    return () => { active = false; };
  }, [selectedPatient]);

  async function doConsent() {
    if (!selectedPatient || !caregiverId) {
      setStatus("Select a patient first.");
      return;
    }
    if (!name.trim() || !agree) { setStatus("Enter the name and tick consent."); return; }
    try {
      await saveConsent(name.trim(), selectedPatient.id, caregiverId);
      setStatus("");
      setConsented(true);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Consent could not be saved.");
    }
  }

  async function choosePatient(patient: Patient) {
    try {
      setStatus("Opening patient profile…");
      const [existingConsent, role] = await Promise.all([
        hasVoiceConsent(patient.id, caregiverId),
        getCaregiverRole(patient.id, caregiverId),
      ]);
      setActivePatientId(patient.id);
      setSelectedPatient(patient);
      setSelectedRole(role);
      setPairingUrl("");
      setInvitationUrl("");
      setInviteEmail("");
      setDevices([]);
      setMembers([]);
      setConsented(existingConsent);
      setAgree(false);
      setPhotos([]);
      setAudioUrl("");
      setLabel("");
      setNote("");
      setType("object");
      setLanguage(patient.preferredLanguage);
      setStatus("");
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Patient profile could not be opened.";
      setStatus(message);
    }
  }

  function changePatient() {
    clearActivePatientId();
    setSelectedPatient(null);
    setSelectedRole(null);
    setPairingUrl("");
    setInvitationUrl("");
    setInviteEmail("");
    setDevices([]);
    setMembers([]);
    setConsented(false);
    setAgree(false);
    setPhotos([]);
    setAudioUrl("");
    setStatus("");
  }

  async function addPatient() {
    if (!patientName.trim()) {
      setStatus("Enter the patient's name.");
      return;
    }
    try {
      setStatus("Creating patient profile…");
      const patient = await createPatient(patientName, patientLanguage);
      setPatients((current) => [...current, patient]);
      setPatientName("");
      await choosePatient(patient);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Patient could not be created.");
    }
  }

  async function makePairingLink() {
    if (!selectedPatient) return;
    try {
      setStatus("Creating a ten-minute pairing link…");
      const pairing = await createPairingToken(selectedPatient.id);
      setPairingUrl(`${window.location.origin}/pair?token=${encodeURIComponent(pairing.token)}`);
      setStatus("Pairing link ready. Open it on the patient's device within ten minutes.");
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Pairing link could not be created.";
      setStatus(message);
    }
  }

  async function makeCaregiverInvitation() {
    if (!selectedPatient || !inviteEmail.trim()) {
      setStatus("Enter the caregiver email to invite.");
      return;
    }
    try {
      setStatus("Creating caregiver invitation…");
      const invitation = await createCaregiverInvitation(
        selectedPatient.id,
        inviteEmail,
        inviteRole,
      );
      setInvitationUrl(
        `${window.location.origin}/invite?token=${encodeURIComponent(invitation.token)}`,
      );
      setStatus("Invitation ready. Share it only with the named caregiver; it expires in 24 hours.");
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Caregiver invitation could not be created."));
    }
  }

  async function revokeDevice(device: PatientDevice) {
    if (device.revokedAt) return;
    try {
      await revokePatientDevice(device.id);
      setDevices((current) => current.map((entry) =>
        entry.id === device.id
          ? { ...entry, revokedAt: new Date().toISOString() }
          : entry,
      ));
      setStatus(`${device.label} was revoked.`);
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Patient device could not be revoked."));
    }
  }

  async function removeSelectedPatient() {
    if (!selectedPatient) return;
    const confirmed = window.confirm(
      `Delete ${selectedPatient.displayName} and all enrolled items and media? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      setStatus("Deleting patient profile and private media…");
      await deletePatient(selectedPatient.id);
      setPatients((current) => current.filter((patient) => patient.id !== selectedPatient.id));
      changePatient();
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Patient profile could not be deleted."));
    }
  }

  async function leaveCaregiverMode() {
    try {
      await signOut();
    } finally {
      clearActivePatientId();
      router.replace("/auth");
    }
  }

  async function addPhoto() {
    if (!videoRef.current) return;
    try {
      const blob = await capturePhoto(videoRef.current);
      setPhotos((current) => [...current, blob].slice(0, 5));
    } catch {
      setStatus("The camera is not ready. Choose image files instead.");
    }
  }

  function addPhotoFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    setPhotos((current) => [...current, ...selected].slice(0, 5));
    setStatus(
      selected.length > 0
        ? "Photos selected. Add 3–5 different angles."
        : "Choose JPEG, PNG, or WebP image files.",
    );
    event.target.value = "";
  }

  async function save() {
    if (!selectedPatient) { setStatus("Select a patient first."); return; }
    if (!label.trim()) { setStatus("Enter an item label."); return; }
    if (!note.trim()) { setStatus("Enter a short caregiver note."); return; }
    if (photos.length < 3) { setStatus("Add at least 3 photos."); return; }
    if (!audioUrl) { setStatus("Record a voice note first."); return; }
    setSaving(true);
    try {
      setStatus("Making photo fingerprints…");
      const vectors: number[][] = [];
      const photo_urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        vectors.push(await embedImage(photos[i]));
        photo_urls.push(await uploadFile("photos", photos[i], `p-${Date.now()}-${i}.jpg`, selectedPatient.id));
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
        patient_id: selectedPatient.id,
        label, type, note_raw: note, note_text: warm,
        audio_url: audioUrl, language, vectors, photo_urls,
      });

      setStatus("Saved ✓ This item is now recognisable in patient mode.");
      setPhotos([]); setAudioUrl("");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "The item could not be saved.");
    }
    setSaving(false);
  }

  if (authLoading) {
    return <main className="app"><p className="status">Checking caregiver account…</p></main>;
  }

  if (!caregiverId) {
    return (
      <main className="app">
        <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
          <h2>Caregiver sign-in required</h2>
          {status && <p className="alert">{status}</p>}
          <Link className="btn primary" href="/auth">Open sign in</Link>
        </div>
      </main>
    );
  }

  if (!selectedPatient) {
    return (
      <main className="app">
        <header className="topbar">
          <div className="brand"><span className="mark">M</span><span>Caregiver dashboard</span></div>
          <button type="button" onClick={leaveCaregiverMode}>Sign out</button>
        </header>
        <div className="layout">
          <section className="card">
            <h2>Select a patient</h2>
            <div className="stack">
              {patients.map((patient) => (
                <button className="soft" type="button" key={patient.id} onClick={() => void choosePatient(patient)}>
                  {patient.displayName}
                </button>
              ))}
              {patients.length === 0 && <p className="muted">Create the first patient profile for this caregiver account.</p>}
            </div>
          </section>
          <section className="card">
            <h2>Create patient profile</h2>
            <div className="stack">
              <label>Patient display name
                <input value={patientName} onChange={(event) => setPatientName(event.target.value)} />
              </label>
              <label>Preferred language
                <select value={patientLanguage} onChange={(event) => setPatientLanguage(event.target.value as "en" | "ur")}>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </select>
              </label>
              <button className="primary" type="button" onClick={addPatient}>Create patient</button>
              {status && <p className="alert">{status}</p>}
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ---------- Consent screen ----------
  if (!consented && selectedRole !== "viewer") {
    return (
      <main className="app">
        <header className="topbar">
          <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
          <button type="button" onClick={changePatient}>Change patient</button>
        </header>
        <div className="card" style={{ maxWidth: 560 }}>
          <h2>Voice consent</h2>
          <p><strong>Patient:</strong> {selectedPatient.displayName}</p>
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
          <button type="button" onClick={changePatient}>Change patient</button>
          <Link className="btn primary" href="/patient">Preview patient</Link>
        </div>
      </header>

      <div className="layout">
        {selectedRole === "viewer" ? (
          <div className="card">
            <h2>View-only caregiver access</h2>
            <p>You can preview this patient&apos;s recognition experience, but only an owner or editor can enroll items or manage devices.</p>
          </div>
        ) : (
        <div className="stack">
          <div className="card">
            <h2>Caregiver enrollment</h2>
            <p className="muted">Take 3–5 photos, record one short note, add details, then Save.</p>
          </div>

          <div className="card">
            <h3>1. Photos <span className="urdu">تصاویر</span></h3>
            <div className="camera"><video ref={videoRef} playsInline muted /></div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="soft" onClick={addPhoto} disabled={!cameraReady}>
                Take camera photo ({photos.length}/5)
              </button>
              <button onClick={() => setPhotos([])}>Clear</button>
            </div>
            <label style={{ marginTop: 12 }}>
              Or choose image files from this computer
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={addPhotoFiles}
              />
            </label>
            <div className="thumbs">
              {photos.map((photo, index) => (
                <PhotoThumbnail photo={photo} index={index} key={index} />
              ))}
            </div>
            <small>3–5 angles improve matching.</small>
          </div>

          <div className="card">
            <h3>2. Voice note <span className="urdu">آواز</span></h3>
            <VoiceRecorder patientId={selectedPatient.id} onSaved={setAudioUrl} />
            {audioUrl && <div className="success" style={{ marginTop: 10 }}>Voice note saved ✓</div>}
          </div>

          <div className="card">
            <h3>3. Details</h3>
            <div className="fields">
              <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
              <label>Type
                <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
                  <option value="med">Medicine</option>
                  <option value="object">Object</option>
                </select>
              </label>
              <label>Language
                <select value={language} onChange={(e) => setLanguage(e.target.value as ItemLanguage)}>
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
        )}

        <aside className="card">
          <h3>Patient device setup</h3>
          <p><strong>Selected patient:</strong> {selectedPatient.displayName}</p>
          <p className="muted">Create a temporary link that signs in this patient&apos;s phone or tablet without requiring them to remember a password.</p>
          {selectedRole !== "viewer" && (
            <button type="button" onClick={makePairingLink}>Generate pairing link</button>
          )}
          {pairingUrl && (
            <label style={{ marginTop: 12 }}>Ten-minute pairing link
              <input value={pairingUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
            </label>
          )}

          <hr style={{ margin: "24px 0", opacity: 0.25 }} />
          <h3>Paired devices</h3>
          {devices.length === 0 && <p className="muted">No patient devices are paired yet.</p>}
          <div className="stack">
            {devices.map((device) => (
              <div key={device.id}>
                <strong>{device.label}</strong>
                <p className="muted">{device.revokedAt ? "Revoked" : "Active"}</p>
                {!device.revokedAt && selectedRole !== "viewer" && (
                  <button type="button" onClick={() => void revokeDevice(device)}>Revoke device</button>
                )}
              </div>
            ))}
          </div>

          <hr style={{ margin: "24px 0", opacity: 0.25 }} />
          <h3>Caregivers</h3>
          <div className="stack">
            {members.map((member) => (
              <p key={member.id}><strong>{member.displayName}</strong> · {member.role}</p>
            ))}
            {selectedRole === "owner" && (
              <>
                <label>Caregiver email
                  <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                </label>
                <label>Access level
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}>
                    <option value="editor">Editor — enroll and update items</option>
                    <option value="viewer">Viewer — view and preview only</option>
                  </select>
                </label>
                <button type="button" onClick={makeCaregiverInvitation}>Generate caregiver invitation</button>
                {invitationUrl && (
                  <label>24-hour invitation link
                    <input value={invitationUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                  </label>
                )}
              </>
            )}
          </div>

          {selectedRole === "owner" && (
            <>
              <hr style={{ margin: "24px 0", opacity: 0.25 }} />
              <h3>Danger zone</h3>
              <p className="muted">Deletion removes this patient, enrolled items, pairings, and stored media.</p>
              <button type="button" onClick={removeSelectedPatient}>Delete patient profile</button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
