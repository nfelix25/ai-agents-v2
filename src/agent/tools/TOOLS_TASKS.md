# Tooling MVP Tasks

This checklist turns `TOOLS_OUTLINE.md` into execution tasks for building a comprehensive TypeScript code-assistant MVP.

## How To Use This File
1. Work top-to-bottom by phase.
2. Mark each item complete only when its acceptance checks pass.
3. Do not start a later phase if the current phase exit criteria are not met.

## Global Requirements
- [ ] G1. Every new tool has strict Zod input validation.
- [ ] G2. Every tool returns predictable error shapes.
- [ ] G3. Every tool has unit tests for success and failure paths.
- [ ] G4. Every tool call emits telemetry with name, status, and duration.
- [ ] G5. Tool docs are updated with purpose, inputs, outputs, and error modes.

## Phase 0 - Foundation
Objective: establish shared conventions before adding more tools.

Deliverables:
- [ ] P0.1 Define a common tool result envelope (success, data, error, meta).
- [ ] P0.2 Add shared helpers for path normalization and workspace boundary checks.
- [ ] P0.3 Add shared helpers for truncation limits and output-size metadata.
- [ ] P0.4 Add shared error taxonomy (validation error, permission error, execution error, timeout).
- [ ] P0.5 Add testing utilities for tool execution and snapshot-friendly outputs.

Acceptance checks:
- [ ] P0.A1 Existing tools still work with the shared helpers.
- [ ] P0.A2 Error messages are stable across repeated runs.

## Phase 1 - Discovery and Read Quality
Objective: improve context retrieval quality and reduce token waste.

Tools in scope:
- `projectContext`
- `searchCode`
- `readFileRange`

### 1A. projectContext
- [ ] P1.1 Define `projectContext` input schema (optional root path).
- [ ] P1.2 Read project metadata files (package manager, scripts, TS config, workspace files).
- [ ] P1.3 Return structured context: commands, package manager, workspace layout, notable config flags.
- [ ] P1.4 Handle missing files gracefully with partial context responses.
- [ ] P1.5 Add tests for single-package and workspace-style repositories.

Acceptance checks:
- [ ] P1.1A Assistant can identify likely `build`, `test`, `lint`, and `typecheck` commands from one call.

### 1B. searchCode
- [ ] P1.6 Define `searchCode` input schema (`query`, `glob`, `caseSensitive`, `maxResults`).
- [ ] P1.7 Implement fast repository search with path, line number, and snippet output.
- [ ] P1.8 Enforce safe defaults for broad queries (result caps and truncation metadata).
- [ ] P1.9 Normalize output into a structured list for deterministic model consumption.
- [ ] P1.10 Add tests: exact match, zero results, high-volume results, glob filtering.

Acceptance checks:
- [ ] P1.2A Search returns line-referenced results in consistent shape.

### 1C. readFileRange
- [ ] P1.11 Define `readFileRange` input schema (`path`, `startLine`, `endLine`).
- [ ] P1.12 Validate and normalize line ranges (including out-of-bounds behavior).
- [ ] P1.13 Return line-numbered excerpts and truncation metadata.
- [ ] P1.14 Add tests: valid ranges, invalid ranges, missing file, boundary handling.

Acceptance checks:
- [ ] P1.3A The assistant can cite exact lines without reading full files.

Phase exit criteria:
- [ ] P1.E1 Discovery tasks complete with passing tests.
- [ ] P1.E2 Eval prompts for file discovery prefer `searchCode` over brute-force full reads.

## Phase 2 - Editing and Execution
Objective: enable deterministic edits and safe command execution loops.

Tools in scope:
- `replaceInFile` or patch-style editor
- `runCommand`
- `formatFiles`

### 2A. replaceInFile (or patch tool)
- [ ] P2.1 Select editing strategy and document tradeoffs.
- [ ] P2.2 Define schema for target path and edit operations.
- [ ] P2.3 Require explicit preconditions to avoid accidental broad replacements.
- [ ] P2.4 Return edit summary: replacements attempted, replacements applied, lines touched.
- [ ] P2.5 Add tests: single edit, multi-edit, missing target, ambiguous match behavior.

Acceptance checks:
- [ ] P2.1A Edits are deterministic and minimally scoped.

### 2B. runCommand
- [ ] P2.6 Define `runCommand` schema (`command`, `cwd`, `timeoutMs`, optional env allowlist).
- [ ] P2.7 Enforce workspace-only execution boundaries.
- [ ] P2.8 Add command safety policy (allow/deny rules and blocked patterns).
- [ ] P2.9 Capture stdout, stderr, exit code, duration, and timeout flag.
- [ ] P2.10 Add tests: success, non-zero exit, timeout, restricted command.

Acceptance checks:
- [ ] P2.2A Build/test/lint commands run successfully when valid.
- [ ] P2.2B Blocked commands fail safely with actionable errors.

### 2C. formatFiles
- [ ] P2.11 Define formatter resolution order from project context.
- [ ] P2.12 Support targeted file formatting and no-op reporting.
- [ ] P2.13 Return whether files changed and summarize formatter output.
- [ ] P2.14 Add tests: formatter exists, formatter missing, no changes, parse failures.

Acceptance checks:
- [ ] P2.3A Formatting can be invoked consistently after edit operations.

Phase exit criteria:
- [ ] P2.E1 Assistant can complete read-edit-validate loop on representative TypeScript tasks.
- [ ] P2.E2 Safety rules prevent obvious risky command usage.

## Phase 3 - Validation Intelligence
Objective: return high-signal diagnostics and failure summaries.

Tools in scope:
- `getDiagnostics`
- `runTests`
- `gitStatus`
- `gitDiff`

### 3A. getDiagnostics
- [ ] P3.1 Define diagnostics schema (tool, file, line, column, code, severity, message).
- [ ] P3.2 Implement TypeScript diagnostic extraction.
- [ ] P3.3 Implement lint diagnostic extraction.
- [ ] P3.4 Merge and sort diagnostics by severity and file location.
- [ ] P3.5 Add truncation and grouping rules to keep outputs compact.
- [ ] P3.6 Add tests for mixed diagnostic sets and parser edge cases.

Acceptance checks:
- [ ] P3.1A Diagnostic output is structured and stable across runs.

### 3B. runTests
- [ ] P3.7 Define `runTests` modes (full suite, path-targeted, pattern-targeted).
- [ ] P3.8 Parse test output into summary plus failed case details.
- [ ] P3.9 Include duration and flaky-test hints when applicable.
- [ ] P3.10 Add tests for all-pass, some-fail, command error, and no-tests found.

Acceptance checks:
- [ ] P3.2A Assistant can isolate failing test cases and relevant files quickly.

### 3C. gitStatus
- [ ] P3.11 Return branch info and file state categories (modified, staged, untracked).
- [ ] P3.12 Handle non-git workspace errors gracefully.
- [ ] P3.13 Add tests for clean and dirty repositories.

Acceptance checks:
- [ ] P3.3A Assistant can reliably report what changed during a task.

### 3D. gitDiff
- [ ] P3.14 Support repo-level and file-scoped diff retrieval.
- [ ] P3.15 Add max-size controls and truncation indicators.
- [ ] P3.16 Preserve enough context for change explanation.
- [ ] P3.17 Add tests for multi-file diffs and binary/no-diff paths.

Acceptance checks:
- [ ] P3.4A Assistant can summarize concrete code changes with file-level clarity.

Phase exit criteria:
- [ ] P3.E1 Assistant can run diagnose-fix-retest loops with structured outputs only.
- [ ] P3.E2 Final task summaries can include accurate git status and diff context.

## Phase 4 - TypeScript Semantic Tools (Optional MVP+)
Objective: improve large-scale refactor reliability.

Tools in scope:
- `findDefinitions`
- `findReferences`

Tasks:
- [ ] P4.1 Choose semantic backend strategy and document constraints.
- [ ] P4.2 Implement `findDefinitions` with file/line/column return shape.
- [ ] P4.3 Implement `findReferences` with cross-file location results.
- [ ] P4.4 Add tests for overloaded symbols, re-exports, and monorepo boundaries.
- [ ] P4.5 Add performance guardrails for very large projects.

Acceptance checks:
- [ ] P4.A1 Symbol-level queries outperform plain text search on refactor scenarios.

Phase exit criteria:
- [ ] P4.E1 Assistant can locate and update cross-file symbol usage reliably.

## Tool Integration Tasks
Objective: wire new tools into the runtime safely and predictably.

- [ ] I1 Add each new tool export to `src/agent/tools/index.ts`.
- [ ] I2 Confirm tool descriptions are concise and disambiguate when each should be used.
- [ ] I3 Ensure the run loop handles tool-result payload shape consistently.
- [ ] I4 Add logging hooks for tool start/end with normalized metadata.
- [ ] I5 Verify that tool call ordering remains deterministic in multi-step flows.

Acceptance checks:
- [ ] I.A1 New tools appear in runtime and eval toolsets as expected.

## Evaluation and Quality Gates
Objective: prevent regressions in tool selection and task execution.

### Selection evals
- [ ] Q1 Add eval prompts that require `searchCode` and forbid `runCommand`.
- [ ] Q2 Add eval prompts that require `runCommand` and forbid file-only tools.
- [ ] Q3 Add ambiguous prompts to test precision of tool routing.

### Workflow evals
- [ ] Q4 Add multi-turn evals for read-edit-typecheck-fix-test loops.
- [ ] Q5 Add negative evals for blocked commands and unsafe paths.
- [ ] Q6 Add evals that check final response includes concrete file references.

### Release gate
- [ ] Q7 Define minimum passing thresholds for selection and workflow eval groups.
- [ ] Q8 Require passing quality gates before enabling tools by default.

## Documentation Tasks
- [ ] D1 Document each tool contract (inputs, outputs, errors, limits).
- [ ] D2 Add examples of correct tool choice by task type.
- [ ] D3 Document safety constraints and blocked operations.
- [ ] D4 Add troubleshooting notes for common tool failures.

## Suggested Execution Order
1. Complete Phase 0.
2. Complete Phase 1.
3. Complete Phase 2.
4. Complete Phase 3.
5. Run quality gate checks.
6. Optionally complete Phase 4.

## Definition of Done (Program-Level)
- [ ] DD1 Assistant can complete at least one realistic TypeScript bug-fix task end-to-end.
- [ ] DD2 Assistant can complete at least one small feature task end-to-end.
- [ ] DD3 Tool-selection and workflow eval suites pass defined thresholds.
- [ ] DD4 Safety checks prevent disallowed file or command actions.
- [ ] DD5 Documentation is updated and consistent with implemented behavior.
