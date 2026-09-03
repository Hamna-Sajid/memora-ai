// Opens the phone's rear camera and grabs one small (<=512px) photo.

export async function startCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, // rear camera on phones
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function capturePhoto(video: HTMLVideoElement): Promise<Blob> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error("The camera is not ready yet.");
  }

  const size = 512;
  const scale = Math.min(size / video.videoWidth, size / video.videoHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Photo capture is unavailable in this browser.");
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Photo capture failed.")),
      "image/jpeg",
      0.9,
    ),
  );
}
