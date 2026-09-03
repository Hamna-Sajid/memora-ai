import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const modelId = "Xenova/clip-vit-base-patch32";
const packageCache = path.join(
  process.cwd(),
  "node_modules",
  "@huggingface",
  "transformers",
  ".cache",
  ...modelId.split("/"),
);
const publicModel = path.join(
  process.cwd(),
  "public",
  "models",
  ...modelId.split("/"),
);
const requiredFiles = [
  "config.json",
  "preprocessor_config.json",
  path.join("onnx", "vision_model_quantized.onnx"),
];

async function requireFile(relativePath) {
  const source = path.join(packageCache, relativePath);
  const details = await stat(source).catch(() => null);

  if (!details?.isFile() || details.size === 0) {
    throw new Error(
      `Missing cached model file: ${relativePath}. Run the recognition spike once while online, then retry.`,
    );
  }

  return source;
}

for (const relativePath of requiredFiles) {
  const source = await requireFile(relativePath);
  const destination = path.join(publicModel, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
  console.log(`Prepared ${path.relative(process.cwd(), destination)}`);
}

console.log("Local browser CLIP assets are ready.");
