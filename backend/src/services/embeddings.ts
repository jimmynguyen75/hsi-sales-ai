/**
 * Local semantic embeddings via @xenova/transformers (ONNX MiniLM, ~25MB).
 *
 * Why local instead of an API: no OpenAI/Cohere key required, zero per-query cost,
 * product catalog is tiny (~40 items) so in-memory cosine is fine. Model loads
 * lazily on first use and caches under ~/.cache/huggingface.
 *
 * Graceful fallback: if the model fails to load (offline, low RAM, etc.), all
 * calls return `null` and the caller falls back to keyword search. The whole
 * feature is optional — the Knowledge Bot still works, just without semantic rank.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureExtractor = (text: string | string[], opts: any) => Promise<{ data: Float32Array }>;

let extractor: FeatureExtractor | null = null;
let loadPromise: Promise<FeatureExtractor | null> | null = null;
let loadFailed = false;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function loadModel(): Promise<FeatureExtractor | null> {
  if (extractor) return extractor;
  if (loadFailed) return null;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Dynamic import — transformers is CJS and we want to avoid loading it at
      // module init (it's ~50MB of code even before model weights).
      const mod = await import("@xenova/transformers");
      const pipeline = mod.pipeline;
      console.log(`[embeddings] loading ${MODEL_ID} (first run downloads ~25MB)...`);
      const start = Date.now();
      const pipe = await pipeline("feature-extraction", MODEL_ID);
      console.log(`[embeddings] model loaded in ${Date.now() - start}ms`);
      extractor = pipe as unknown as FeatureExtractor;
      return extractor;
    } catch (err) {
      console.warn(
        `[embeddings] model load failed, falling back to keyword search:`,
        err instanceof Error ? err.message : err,
      );
      loadFailed = true;
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Embed a single string. Returns 384-dim Float32 array, or null if model unavailable.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const pipe = await loadModel();
  if (!pipe) return null;

  const trimmed = text.trim().slice(0, 2000); // model has 512 token cap, 2k chars is safe
  if (!trimmed) return null;

  try {
    const output = await pipe(trimmed, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.warn(`[embeddings] embed failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Cosine similarity between two equal-length vectors. Assumes both are L2-normalized
 * (MiniLM with normalize:true returns unit vectors), so this is just a dot product.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Whether the embedding model is loaded. Used for `/api/health` to report RAG state.
 */
export function isEmbeddingReady(): boolean {
  return extractor !== null && !loadFailed;
}

/**
 * Whether embeddings are disabled (model failed to load). Callers can use this to
 * skip expensive setup early.
 */
export function isEmbeddingDisabled(): boolean {
  return loadFailed;
}
