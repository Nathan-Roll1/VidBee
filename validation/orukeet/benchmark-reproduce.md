# Reproduce the matched benchmark

[benchmark-reproduce.ts](benchmark-reproduce.ts) is a read-only runner for the matched comparison in [benchmark-public.md](benchmark-public.md). Keep it beside `benchmark-public.json` and `benchmark-fixtures.tsv`. It downloads nothing, verifies model and audio SHA-256 values, checks complete-utterance frame counts, and imports the VidBee checkout's real recognizer configuration, WAV reader, result reader and word-timing functions.

Use the PR checkout with its dependencies installed. Supply these existing assets:

- Orukeet's pinned Sherpa ONNX directory containing `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt`.
- Parakeet v3 INT8's equivalent four files. Exact required hashes and download sources are recorded in `benchmark-public.json`.
- FLEURS at dataset revision `70bb2e84b976b7e960aa89f1c648e09c59f894dd`. Under the supplied FLEURS directory, put each language's original `test.tsv` at `<config>/test.tsv` and extracted audio at `<config>/<archive_member>`, for example `bg_bg/test/10377783381116379173.wav`. The archive/member IDs and hashes are in `benchmark-fixtures.tsv`. The TSV is read literally as tabs, matching the original benchmark's handling of quoted text.
- An 11-second mono 16 kHz JFK WAV as warmup. Warmup is excluded from measurements; changing it may affect initialization/warm-cache behavior. The benchmark utterances themselves must match the recorded hashes exactly.

Set `VIDBEE_REPO`, `VIDBEE_EVIDENCE`, `FLEURS_DIR`, `ORUKEET_DIR`, `PARAKEET_DIR`, `WARMUP_WAV`, and `RESULT_JSON` to your local paths. `RESULT_JSON` must be a writable output file path. From the VidBee repository root:

```sh
pnpm --filter api exec tsx "$VIDBEE_EVIDENCE/benchmark-reproduce.ts" \
  --repo "$VIDBEE_REPO" \
  --fleurs-dir "$FLEURS_DIR" \
  --orukeet-dir "$ORUKEET_DIR" \
  --parakeet-dir "$PARAKEET_DIR" \
  --warmup-wav "$WARMUP_WAV" \
  --output "$RESULT_JSON"
```

Add `--limit 2` for a quick smoke run. Omitting the limit runs all 400 clips for both models. Use CPU provider / two inference threads and `sherpa-onnx-node` 1.13.6, as enforced by the runner. Output contains per-clip references, predictions, errors, duration and latency, plus totals and initialization times.

The portable runner was smoke-tested on two complete Bulgarian utterances using freshly retrieved canonical FLEURS `test.tsv`; it reproduced the full benchmark's exact word-error counts for both clips (Orukeet 4 errors and Parakeet 5 errors over 49 words). The published 400-clip figures come from the original external harness; the portable extraction was not rerun on all 400 clips. Latency is hardware/load dependent, and no timing equivalence is claimed for the smoke run.
