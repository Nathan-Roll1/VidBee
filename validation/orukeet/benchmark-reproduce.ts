/** Read-only benchmark: use pre-staged model and FLEURS files; never downloads assets. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(name)
  if (i < 0 || !argv[i + 1]) throw new Error(`Missing ${name}`)
  return resolve(argv[i + 1])
}
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
const distance = (a: string[], b: string[]) => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++)
      row.push(
        Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]))
      )
    previous = row
  }
  return previous[b.length]
}
async function main() {
  const repo = arg('--repo'),
    dataset = arg('--fleurs-dir'),
    output = arg('--output')
  const evidence = resolve(fileURLToPath(new URL('.', import.meta.url)))
  const modelDirs = { orukeet: arg('--orukeet-dir'), 'parakeet-v3': arg('--parakeet-dir') }
  const published = JSON.parse(readFileSync(join(evidence, 'benchmark-public.json'), 'utf8'))
  const fixtures = readFileSync(join(evidence, 'benchmark-fixtures.tsv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [config, member, id, samples, sha256] = line.split('\t')
      return { config, member, id, samples: Number(samples), sha256 }
    })
  const limitIndex = argv.indexOf('--limit')
  const selected = limitIndex < 0 ? fixtures : fixtures.slice(0, Number(argv[limitIndex + 1]))
  globalThis.fetch = async () => {
    throw new Error('Read-only benchmark forbids fetching')
  }
  const req = createRequire(join(repo, 'packages/transcription/package.json'))
  const addon = req('sherpa-onnx-node')
  assert.equal(req('sherpa-onnx-node/package.json').version, '1.13.6')
  const load = (name: string) =>
    import(pathToFileURL(join(repo, 'packages/transcription/src', name)).href)
  const { buildOfflineRecognizerConfig } = await load('asr-recognizer.ts')
  const { readAsrResult } = await load('asr-json.ts')
  const { readPcmWav } = await load('audio.ts')
  const { wordsFromAsrResult } = await load('asr-words.ts')
  const models: Record<string, any> = {},
    loadMs: Record<string, number> = {}
  for (const [name, dir] of Object.entries(modelDirs)) {
    for (const role of ['encoder', 'decoder', 'joiner', 'tokens']) {
      const entry = published.models.find((m: any) => m.id === `${name}-${role}`)
      assert.equal(
        hash(
          join(
            dir,
            basename(new URL(entry.url).pathname).endsWith('.bz2')
              ? role === 'tokens'
                ? 'tokens.txt'
                : `${role}.int8.onnx`
              : basename(new URL(entry.url).pathname)
          )
        ),
        entry.sha256
      )
    }
    const paths = {
      encoder: join(dir, 'encoder.int8.onnx'),
      decoder: join(dir, 'decoder.int8.onnx'),
      joiner: join(dir, 'joiner.int8.onnx'),
      tokens: join(dir, 'tokens.txt'),
      frontend: null,
      model: null,
      tokenizer: null
    }
    const start = performance.now()
    models[name] = new addon.OfflineRecognizer(
      buildOfflineRecognizerConfig('parakeet', paths, 2, undefined, 'cpu')
    )
    loadMs[name] = performance.now() - start
  }
  const warm = readPcmWav(arg('--warmup-wav'))
  for (const rec of Object.values(models)) {
    const stream = rec.createStream()
    stream.acceptWaveform(warm)
    rec.decode(stream)
    readAsrResult(rec, stream)
  }
  const rows: any[] = []
  for (const [i, f] of selected.entries()) {
    const path = join(dataset, f.config, f.member)
    assert.equal(hash(path), f.sha256)
    const wave = readPcmWav(path)
    assert.equal(wave.sampleRate, 16000)
    assert.equal(wave.samples.length, f.samples)
    const source = readFileSync(join(dataset, f.config, 'test.tsv'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .find((row) => row[1] === basename(f.member))
    assert.ok(source, `Missing source reference ${f.config}/${f.member}`)
    assert.equal(Number(source[5]), f.samples)
    const reference = source[2],
      ref = norm(reference),
      durationMs = f.samples / 16
    for (const name of i % 2 === 0 ? ['orukeet', 'parakeet-v3'] : ['parakeet-v3', 'orukeet']) {
      const rec = models[name],
        stream = rec.createStream(),
        start = performance.now()
      stream.acceptWaveform(wave)
      rec.decode(stream)
      const result = readAsrResult(rec, stream),
        elapsedMs = performance.now() - start
      assert.equal(result.tokens.length, result.timestamps.length)
      for (const [j, t] of result.timestamps.entries())
        assert.ok(
          Number.isFinite(t) &&
            t >= 0 &&
            t * 1000 <= durationMs + 1 &&
            (j === 0 || t >= result.timestamps[j - 1])
        )
      const words = wordsFromAsrResult(result, 0, durationMs)
      for (const w of words)
        assert.ok(w.startMs >= 0 && w.endMs > w.startMs && w.endMs <= durationMs + 1)
      rows.push({
        model: name,
        config: f.config,
        member: f.member,
        reference,
        text: result.text,
        durationMs,
        elapsedMs,
        referenceWords: ref.length,
        wordErrors: distance(ref, norm(result.text ?? ''))
      })
    }
    if ((i + 1) % 10 === 0) process.stderr.write(`${i + 1}/${selected.length}\n`)
  }
  const totals = Object.fromEntries(
    Object.keys(models).map((name) => {
      const rs = rows.filter((r) => r.model === name),
        sum = (key: string) => rs.reduce((n, r) => n + r[key], 0)
      return [
        name,
        {
          errors: sum('wordErrors'),
          referenceWords: sum('referenceWords'),
          wer: sum('wordErrors') / sum('referenceWords'),
          elapsedMs: sum('elapsedMs'),
          audioMs: sum('durationMs'),
          rtf: sum('elapsedMs') / sum('durationMs')
        }
      ]
    })
  )
  writeFileSync(
    output,
    JSON.stringify({ clips: selected.length, loadMs, totals, rows }, null, 2) + '\n'
  )
  console.log(JSON.stringify({ clips: selected.length, loadMs, totals }, null, 2))
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
