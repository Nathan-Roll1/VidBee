# Orukeet in VidBee: bounded integration benchmark

Measured September 20, 2026 using VidBee's production recognizer configuration and installed `sherpa-onnx-node` 1.13.6, Apple M5 Max / macOS arm64 / 128 GiB RAM / Node 25.9.0, CPU provider with two inference threads.

The optional Orukeet catalog entry uses [published Sherpa ONNX INT8 R3 artifacts](https://huggingface.co/oruk/orukeet/tree/debfb0d5423d4b0446361e0ea024e6891e23a249/onnx/sherpa-v0.1.0-int8). All tested component hashes match the pinned public manifest. The comparison is VidBee's existing [Parakeet TDT 0.6B v3 INT8 model](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2). Model/file hashes, runtime details and exact totals are in [benchmark-public.json](benchmark-public.json).

## Results

400 complete utterances across 25 languages; 4,082.14 seconds of audio; 7,630 reference words.

| Measurement | Parakeet v3 INT8 | Orukeet R3 INT8 |
| --- | ---: | ---: |
| Word errors | 1,634 | 1,506 |
| Aggregate word error rate | 21.42% | 19.74% |
| Warm decode time, all 400 clips | 159.24 s | 134.32 s |
| Real-time factor | 0.03901 | 0.03290 |
| Recognizer initialization | 702 ms | 755 ms |
| Decodes with valid token/word timing | 400/400 | 400/400 |

On this sample, Orukeet has **7.83% fewer word errors** and **15.65% lower warm decode time**. It improves 20 of the 25 language slices, ties Russian, and regresses on Czech, German, Spanish and Maltese. It remains an optional model; these results do not justify changing defaults or claiming improvement for every language or hardware platform.

A [portable comparison runner and usage instructions](benchmark-reproduce.md) are included. The original harness produced the full 400-clip figures; the portable runner was checked on two matching fixtures and reproduced their original word-error counts.

## Corpus and method

The [FLEURS test dataset](https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd) is pinned at revision `70bb2e84b976b7e960aa89f1c648e09c59f894dd` (CC-BY-4.0). For each language, scan `data/<config>/audio/test.tar.gz` in archive order, match names against `data/<config>/test.tsv`, filter whole utterances to `0 < samples <= 240000`, skip the first 16 eligible members, then select the next 16. The TSV reader uses tab delimiters with quoting disabled so literal quotes remain text. All 400 selected WAV frame counts equal their source TSV/manifest counts; **no audio was truncated or paired with a longer reference**. Each source is the pinned `data/<config>/audio/test.tar.gz` archive plus the listed member. Sample IDs, archive members and SHA-256 hashes are in [benchmark-fixtures.tsv](benchmark-fixtures.tsv).

Both models receive the same complete waveforms. One 11-second warmup per model is excluded. Both models stay loaded; the first model alternates by clip. Warm timing covers waveform submission, native decode and result reading, excluding file I/O, model initialization, text scoring and assertions. This is a local shared-workstation measurement, not a dedicated-server benchmark.

WER uses the original reference transcript (TSV column 3). Both reference and hypothesis are normalized identically: Unicode NFKC, lowercase, remove characters other than letters/numbers/whitespace, collapse whitespace, split on whitespace, then word-level Levenshtein distance. The reported WER is total errors divided by total reference words. Each language has only 16 clips; this is a bounded integration check, not full FLEURS evaluation. A descriptive paired clip bootstrap (3,000 resamples; fixed seed 20260920) gives a 95% percentile interval of −2.66 to −0.64 percentage points for Orukeet minus Parakeet WER.

## Per-language WER

Delta is Orukeet minus Parakeet, in percentage points. Negative values are lower error rates.

| FLEURS configuration | Parakeet v3 | Orukeet R3 | Delta |
| --- | ---: | ---: | ---: |
| bg_bg | 17.45% | 12.15% | -5.30 |
| cs_cz | 17.98% | 20.18% | +2.19 |
| da_dk | 32.12% | 25.83% | -6.29 |
| de_de | 6.22% | 6.72% | +0.50 |
| el_gr | 42.20% | 41.04% | -1.16 |
| en_us | 9.91% | 9.62% | -0.29 |
| es_419 | 1.60% | 2.13% | +0.53 |
| et_ee | 29.44% | 23.83% | -5.61 |
| fi_fi | 18.97% | 17.67% | -1.29 |
| fr_fr | 9.32% | 8.49% | -0.82 |
| hr_hr | 28.98% | 27.39% | -1.59 |
| hu_hu | 33.70% | 27.17% | -6.52 |
| it_it | 2.49% | 2.21% | -0.28 |
| lt_lt | 36.79% | 32.50% | -4.29 |
| lv_lv | 37.11% | 27.34% | -9.77 |
| mt_mt | 57.83% | 67.87% | +10.04 |
| nl_nl | 9.86% | 9.28% | -0.58 |
| pl_pl | 13.12% | 9.93% | -3.19 |
| pt_br | 5.26% | 4.39% | -0.88 |
| ro_ro | 22.16% | 21.31% | -0.85 |
| ru_ru | 9.28% | 9.28% | +0.00 |
| sk_sk | 21.64% | 21.31% | -0.33 |
| sl_si | 62.09% | 60.29% | -1.81 |
| sv_se | 23.51% | 19.54% | -3.97 |
| uk_ua | 18.66% | 16.04% | -2.61 |

## Pipeline checks

The real VidBee single-speaker pipeline was exercised through model path resolution, native inference, 15-second ASR chunking, partial text, word timing, chunk persistence, sentence grouping, SRT export, VTT export and caption parsing. Multi-speaker diarization is unchanged and was outside this model integration check.

| Input | Outcome |
| --- | --- |
| 11-second JFK excerpt | 22 timed words; valid SRT/VTT |
| 66-second repeated JFK excerpt | 15 SRT and 15 VTT cues; exact result after fresh pipeline reload/resume |
| 308-second repeated JFK excerpt | 65 SRT and 67 VTT cues; all word and cue times in bounds |
| 276.22-second concatenation of 25 distinct FLEURS clips | 23 SRT and 35 VTT cues; all word and cue times in bounds |
| 11-second JFK with real Silero VAD | Speech detected; transcript and SRT/VTT produced |
| Three seconds of silence with real Silero VAD | `no-speech`; no transcript or captions |

The 66/308-second inputs are repetition stress tests, and the multilingual input concatenates one whole clip per language with one-second gaps. They validate duration/chunk handling rather than natural continuous-speech accuracy. For all 800 benchmark decodes, token/timestamp counts match and token/word times are finite, nonnegative, monotonic and bounded by clip duration. Exported captions round-trip through VidBee's parser with positive, bounded times. The tests check structural timestamp validity, not timestamp error against human word alignments.

Cached ASR/VAD inference and restart succeed with model fetching blocked. No actual network request occurs. The existing optional punctuation stage attempts to acquire its absent model, receives an immediate offline error, and gracefully preserves the recognized text; those blocked optional attempts are recorded separately. This check does not qualify the punctuation model. Existing local model files were read through symlinks, with no new tensor/checkpoint copies.
