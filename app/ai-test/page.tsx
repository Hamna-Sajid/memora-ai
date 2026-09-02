"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import {
  EMBEDDING_SIZE,
  EmbeddingError,
  embedImage,
  warmEmbeddingModel,
} from "@/lib/ai/embeddings";

type Phase = "warming" | "ready" | "processing" | "error";

type EmbeddingMeasurement = {
  durationMilliseconds: number;
  eventLoopDelayMilliseconds: number;
  magnitude: number;
  size: number;
};

function formatMilliseconds(value: number | null) {
  return value === null ? "Not measured" : `${Math.round(value)} ms`;
}

function calmErrorMessage(error: unknown) {
  if (error instanceof EmbeddingError) {
    if (error.code === "MODEL_LOAD_FAILED") {
      return "The recognition model could not load. Check the connection and try again.";
    }
    if (error.code === "INVALID_INPUT") {
      return "Choose a valid JPEG, PNG, or WebP image.";
    }
  }

  return "The image could not be processed. Please try again.";
}

function startResponsivenessProbe() {
  let active = true;
  let previousFrame = performance.now();
  let worstDelay = 0;
  let animationFrame = 0;

  const sample = (timestamp: number) => {
    worstDelay = Math.max(worstDelay, timestamp - previousFrame - 16.7);
    previousFrame = timestamp;
    if (active) {
      animationFrame = requestAnimationFrame(sample);
    }
  };

  animationFrame = requestAnimationFrame(sample);

  return async () => {
    active = false;
    await new Promise<void>((resolve) => {
      requestAnimationFrame((timestamp) => {
        worstDelay = Math.max(worstDelay, timestamp - previousFrame - 16.7);
        resolve();
      });
    });
    cancelAnimationFrame(animationFrame);
    return Math.max(0, worstDelay);
  };
}

export default function AiPerformanceTestPage() {
  const warmUpStarted = useRef(false);
  const previewUrlReference = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("warming");
  const [warmUpMilliseconds, setWarmUpMilliseconds] = useState<number | null>(
    null,
  );
  const [coldMeasurement, setColdMeasurement] =
    useState<EmbeddingMeasurement | null>(null);
  const [warmMeasurement, setWarmMeasurement] =
    useState<EmbeddingMeasurement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (warmUpStarted.current) {
      return;
    }
    warmUpStarted.current = true;

    let active = true;
    const startedAt = performance.now();

    warmEmbeddingModel()
      .then(() => {
        if (!active) return;
        setWarmUpMilliseconds(performance.now() - startedAt);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(calmErrorMessage(error));
        setPhase("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (previewUrlReference.current) {
        URL.revokeObjectURL(previewUrlReference.current);
      }
    },
    [],
  );

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    if (previewUrlReference.current) {
      URL.revokeObjectURL(previewUrlReference.current);
    }

    const nextPreviewUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    previewUrlReference.current = nextPreviewUrl;
    setSelectedFile(nextFile);
    setPreviewUrl(nextPreviewUrl);
    setErrorMessage(null);
  };

  const measureEmbedding = async () => {
    if (!selectedFile || phase === "processing") {
      return;
    }

    setPhase("processing");
    setErrorMessage(null);
    const stopResponsivenessProbe = startResponsivenessProbe();
    const startedAt = performance.now();

    try {
      const embedding = await embedImage(selectedFile);
      const durationMilliseconds = performance.now() - startedAt;
      const eventLoopDelayMilliseconds = await stopResponsivenessProbe();
      const magnitude = Math.sqrt(
        embedding.reduce((sum, value) => sum + value * value, 0),
      );
      const measurement = {
        durationMilliseconds,
        eventLoopDelayMilliseconds,
        magnitude,
        size: embedding.length,
      };

      if (coldMeasurement === null) {
        setColdMeasurement(measurement);
      } else {
        setWarmMeasurement(measurement);
      }
      setPhase("ready");
    } catch (error) {
      await stopResponsivenessProbe();
      setErrorMessage(calmErrorMessage(error));
      setPhase("error");
    }
  };

  const isBusy = phase === "warming" || phase === "processing";

  return (
    <main className="min-h-screen bg-[#f3efe5] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl bg-[#173b35] p-7 text-white shadow-xl shadow-emerald-950/10 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Internal test surface
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Browser recognition performance
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-emerald-50/85">
            Measure CLIP model warm-up, first-image inference, repeated inference,
            and main-thread responsiveness on the intended demo device.
          </p>
        </header>

        <section
          aria-live="polite"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Metric label="Model warm-up" value={formatMilliseconds(warmUpMilliseconds)} />
          <Metric
            label="First embedding"
            value={formatMilliseconds(coldMeasurement?.durationMilliseconds ?? null)}
          />
          <Metric
            label="Warm embedding"
            value={formatMilliseconds(warmMeasurement?.durationMilliseconds ?? null)}
          />
          <Metric
            label="Worst UI delay"
            value={formatMilliseconds(
              (warmMeasurement ?? coldMeasurement)?.eventLoopDelayMilliseconds ??
                null,
            )}
          />
        </section>

        <section className="grid gap-6 rounded-3xl bg-white p-6 shadow-xl shadow-slate-900/5 md:grid-cols-[1.1fr_0.9fr] sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">Test a camera photo</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The first run records cold inference after model warm-up. Run the
              same or another image again to record warm performance.
            </p>

            <label className="mt-6 block text-sm font-semibold" htmlFor="test-photo">
              JPEG, PNG, or WebP
            </label>
            <input
              id="test-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={isBusy}
              onChange={chooseFile}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-800 file:px-4 file:py-2 file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
            />

            <button
              type="button"
              disabled={!selectedFile || isBusy}
              onClick={measureEmbedding}
              className="mt-4 min-h-12 w-full rounded-2xl bg-emerald-800 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {phase === "warming"
                ? "Loading recognition model…"
                : phase === "processing"
                  ? "Processing image…"
                  : coldMeasurement
                    ? "Measure warm embedding"
                    : "Measure first embedding"}
            </button>

            <p className="mt-4 min-h-6 text-sm font-medium text-slate-700">
              {phase === "warming" && "Downloading or opening the CLIP model…"}
              {phase === "processing" && "Please wait; repeated taps are disabled."}
              {phase === "ready" && "Ready for a photo."}
              {phase === "error" && errorMessage}
            </p>
          </div>

          <div className="relative min-h-64 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Selected test preview"
                fill
                unoptimized
                className="object-contain"
              />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-slate-500">
                The selected photo will appear here.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Latest embedding check</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <Result
              label="Dimensions"
              value={(warmMeasurement ?? coldMeasurement)?.size.toString() ?? "—"}
              expected={EMBEDDING_SIZE.toString()}
            />
            <Result
              label="Magnitude"
              value={
                (warmMeasurement ?? coldMeasurement)?.magnitude.toFixed(6) ?? "—"
              }
              expected="1.000000"
            />
            <Result
              label="Run type"
              value={warmMeasurement ? "Warm" : coldMeasurement ? "First" : "—"}
              expected="First, then warm"
            />
          </dl>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Result({
  expected,
  label,
  value,
}: {
  expected: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-slate-500">Expected: {expected}</dd>
    </div>
  );
}
