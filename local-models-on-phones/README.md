# Local models on phones

This directory captures guidance and planning notes for running local models on mobile devices,
including browser-based and native approaches. Use it as a working area for choosing model sizes,
runtimes, and rollout decisions for the 3DVR portal experience.

## What works well

- Small LLMs (~0.5B–3B params, sometimes 7B with heavy quantization) for chat, summaries,
  extraction, and lightweight code help.
- On-device vision models (labeling, OCR-ish tasks, embeddings).

## What is harder

- Large chat-class models with huge parameter counts (memory + sustained compute constraints).
- Long contexts with fast tokens/sec.

## Rule of thumb

- For a snappy feel: ~1B–3B quantized.
- 7B can run on high-end phones but may be slower and hotter.

## Browser-based options

1. WebGPU (best path)
   - GPU-accelerated inference in supported browsers.
   - Include capability checks for WebGPU availability and memory.
2. WASM fallback
   - More compatible, generally slower than WebGPU.

## Native app options

- Android: quantized model + native runtime with NNAPI/GPU delegates.
- iOS: Core ML / Metal-backed inference or native runtime built for iOS.
- Flutter: FFI to native runtimes or platform channels to call Android/iOS inference.

## Proposed architecture (portal-focused)

1. On-device embeddings + search (fast, private).
2. Optional on-device chat model (small) for basic help.
3. Opt-in cloud escalation for heavier prompts.
4. Visibility system for per-note privacy (local-only, shared, public).

## Next steps

- Define target devices (Android/iOS mix).
- Decide offline-first vs. hybrid with cloud fallback.
- Select candidate model sizes and runtimes for prototypes.
