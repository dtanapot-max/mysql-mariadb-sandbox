# Architecture

```text
Core 1.2 R8-P1
  -> Virtual DB Engine
      -> SQL Parser / AST
      -> Schema + Constraint Engine
      -> Query Engine
      -> MySQL/MariaDB Behavioral Layer
      -> Memory / IndexedDB Storage
      -> Snapshot / Restore
      -> Evidence Engine
  -> AI Control API
  -> Database Manager UI
```

The Virtual DB and UI are external to Core. The browser UI is a client of the same engine used by headless/AI tests; UI code must not mutate database state directly.
