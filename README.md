# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zevabagus-spec/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zevabagus-spec/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files and answers exactly as csv-reader does on every case — same `{columns, rows, errors}`, same broken-row policy — in much less CPU time.

## Approach

The reference reader walks one character at a time and builds every field a character at a time. This reader instead finds each delimiter with the engine's native `indexOf` and cuts each field out with one `slice`:

- **Fast path** — a record whose line holds no quote and no stray CR (the overwhelming majority of records) is split on commas with `indexOf` alone, one slice per field.
- **Slow path** — any record holding a quote or a stray CR is parsed field by field, mirroring the reference exactly: doubled quotes collapse to one, CRLF and lone CR inside quotes read as LF, junk after a closing quote is appended and reported, a quote that never closes is re-read as unquoted, stray CRs are dropped with an error, and short/long rows are padded or cut to the first record's width with the matching error record.

Nothing is cached from one case to the next; `run` is pure, so two runs on the same set produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<cases-dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads `<cases-dir>/cases.json` (a JSON array of `{id, input}`) and writes `out/answers.json`. It runs on Node 22 and needs no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pkrtjm47&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
