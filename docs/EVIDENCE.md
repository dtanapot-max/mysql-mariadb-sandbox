# Evidence model

Every operation records structured fields for run/sequence/timestamp, SQL, parse/execution phase, duration, row/affected counts, state changes, warnings/errors, failure classification and compatibility state.

Evidence retention is bounded. Aggregate operation/error counters remain exact even if old detailed events are dropped from the ring buffer.

CI should regenerate evidence rather than relying only on committed baseline files. A benchmark result is never used as correctness proof.
