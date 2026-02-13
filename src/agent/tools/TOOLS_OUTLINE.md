# Tools Outline for a TypeScript Code Assistant MVP

## Purpose

This document outlines a practical path to evolve the current tool layer into a comprehensive MVP for a TypeScript-focused coding assistant.

It covers:

- What tools to add
- Why each tool matters
- The implementation steps for each tool
- Safety and reliability requirements
- How to verify tool quality before rollout

Companion execution checklist: `TOOLS_TASKS.md`

## Current Baseline

The current toolset in this directory provides:

- `readFile`
- `writeFile`
- `listFiles`
- `deleteFile`
- `getDateTime`

This is a good foundation for basic filesystem operations, but it does not yet support the full developer loop (discover, edit, validate, test, and summarize changes) in a robust way.

## MVP Definition

For this project, a "comprehensive MVP" means the assistant can reliably:

1. Discover relevant code quickly
2. Read only the necessary context
3. Edit with minimal, targeted changes
4. Validate code with typecheck/lint/test commands
5. Explain failures and propose next actions
6. Operate safely within workspace boundaries

## Recommended Tool Set

Prioritize these additions:

1. `searchCode`
2. `readFileRange`
3. `replaceInFile` (or `applyPatch` style editing tool)
4. `runCommand`
5. `getDiagnostics`
6. `runTests`
7. `projectContext`

Optional but high-value:

1. `gitStatus`
2. `gitDiff`
3. `formatFiles`
4. `findReferences` / `findDefinitions` (tsserver-backed)

## Implementation Principles

Apply these principles to every tool:

1. Define explicit input schemas and keep them strict.
2. Return structured outputs where possible, not only plain strings.
3. Include clear error categories so the model can recover correctly.
4. Enforce path and command safety at the tool boundary.
5. Keep tool behavior deterministic and easy to evaluate in tests.
6. Emit telemetry for every call to support debugging and evals.

## Phase Plan

### Phase 1: Discovery and Read Quality

Goal: make the assistant good at finding and consuming the right context.

Tools:

1. `searchCode`
2. `readFileRange`
3. `projectContext`

### Phase 2: Editing and Execution

Goal: enable reliable edit-and-verify loops.

Tools:

1. `replaceInFile` or `applyPatch`
2. `runCommand`
3. `formatFiles`

### Phase 3: Validation Intelligence

Goal: reduce noisy outputs and improve fix guidance.

Tools:

1. `getDiagnostics`
2. `runTests`
3. `gitStatus`
4. `gitDiff`

### Phase 4: TypeScript Semantics (Optional)

Goal: improve large refactors and cross-file correctness.

Tools:

1. `findReferences`
2. `findDefinitions`

## Per-Tool Implementation Outlines

## 1) `searchCode`

Primary outcome: quickly locate symbols, strings, and patterns across the repository.

Steps:

1. Define inputs (`query`, optional `glob`, optional result limits).
2. Use a fast search backend that supports line numbers and file paths.
3. Normalize output shape with fields for file, line, and snippet.
4. Add safeguards for broad queries that could return too much data.
5. Add tests for exact match, fuzzy text, no-result, and large-result scenarios.

Success criteria:

1. Finds relevant results for common prompts in one call.
2. Returns stable, parseable output.
3. Stays performant on medium repositories.

## 2) `readFileRange`

Primary outcome: avoid unnecessary full-file reads and reduce token waste.

Steps:

1. Define inputs (`path`, `startLine`, `endLine`).
2. Validate line ranges and normalize out-of-bounds requests.
3. Return line-numbered content for easier referencing in edits.
4. Add fallback behavior for very small files where full read is equivalent.
5. Add tests for invalid ranges, missing files, and boundary lines.

Success criteria:

1. Correct line slicing and numbering.
2. Predictable behavior on invalid input.
3. Better prompt efficiency in multi-step tasks.

## 3) `replaceInFile` or `applyPatch`

Primary outcome: make deterministic, minimal edits with low regression risk.

Steps:

1. Choose editing strategy:
2. Pattern replacement approach for simple edits.
3. Patch-based approach for contextual edits.
4. Enforce preconditions to avoid accidental broad replacements.
5. Include clear reporting of what changed.
6. Add conflict handling when expected text is not found.
7. Add tests for single replacement, multiple replacements, and no-match behavior.

Success criteria:

1. Edits are localized and reproducible.
2. Failures are explicit and actionable.
3. The model can retry with adjusted context when needed.

## 4) `runCommand`

Primary outcome: enable command-driven validation and project workflows.

Steps:

1. Define inputs (`command`, optional `cwd`, optional timeout).
2. Restrict execution scope to workspace and approved command patterns.
3. Capture stdout, stderr, exit code, and duration.
4. Normalize command failures into structured results.
5. Add protections for long-running or interactive processes.
6. Add tests for success, failure, timeout, and command restriction behavior.

Success criteria:

1. Reliable execution of build/test/lint/typecheck commands.
2. Safe default behavior in non-trusted contexts.
3. Outputs suitable for downstream summarization.

## 5) `getDiagnostics`

Primary outcome: provide structured static-analysis feedback, not raw logs only.

Steps:

1. Determine baseline sources (TypeScript compiler and lint runner).
2. Parse outputs into a shared schema with file, line, rule/code, and message.
3. Add grouping and sorting to prioritize highest-signal issues.
4. Add truncation rules to prevent context flooding.
5. Add tests for mixed diagnostics and parser edge cases.

Success criteria:

1. Consistent issue structure across tools.
2. Improved fix quality compared to raw terminal output.
3. Clear mapping from issue to source location.

## 6) `runTests`

Primary outcome: run and summarize tests with failure-focused output.

Steps:

1. Support project-level and targeted test execution modes.
2. Capture pass/fail summary, failed test names, and relevant stack info.
3. Parse output into structured failures by file and test case.
4. Add timeout and retry strategy guidance for flaky runs.
5. Add tests for passing runs, failing runs, and no-test scenarios.

Success criteria:

1. The model can identify root failing test cases quickly.
2. Results are concise but actionable.
3. The tool is usable across common test runners.

## 7) `projectContext`

Primary outcome: establish project conventions and commands before taking action.

Steps:

1. Read key metadata files and scripts.
2. Extract build/test/lint/typecheck command candidates.
3. Detect package manager and workspace shape.
4. Return a concise context object for planning downstream actions.
5. Add tests for single-package and workspace setups.

Success criteria:

1. The assistant stops guessing basic commands.
2. Reduced tool misuse in first-turn interactions.
3. Better command selection accuracy in evals.

## 8) `gitStatus` (Optional for MVP+, recommended)

Primary outcome: expose uncommitted changes and branch state safely.

Steps:

1. Return tracked/untracked/modified file lists.
2. Include concise branch and ahead/behind info when available.
3. Add error handling for non-git directories.
4. Add tests for clean and dirty worktrees.

Success criteria:

1. Clear visibility into repo state before and after edits.
2. Better user trust through transparent change summaries.

## 9) `gitDiff` (Optional for MVP+, recommended)

Primary outcome: let the assistant inspect and explain actual change deltas.

Steps:

1. Support file-level and repo-level diff modes.
2. Add output size limits with truncation metadata.
3. Preserve enough context for accurate explanation.
4. Add tests for multi-file changes and binary/noisy files.

Success criteria:

1. Reliable post-edit validation and explanation.
2. Better final response quality for "what changed?" prompts.

## 10) `formatFiles` (Optional for MVP+, recommended)

Primary outcome: keep edits style-compliant and review-ready.

Steps:

1. Resolve formatter command from project context.
2. Support targeted file formatting.
3. Report formatting changes and any formatter failures.
4. Add tests for no-op and changed formatting runs.

Success criteria:

1. Fewer style-only diffs in subsequent edits.
2. Higher pass rate on lint/style checks.

## 11) `findReferences` and `findDefinitions` (Optional advanced)

Primary outcome: enable semantic refactors beyond text search.

Steps:

1. Choose tsserver integration strategy.
2. Map symbol queries to file and position references.
3. Return structured reference locations with confidence metadata.
4. Add tests for overloaded symbols and cross-file references.

Success criteria:

1. More reliable refactors in medium-to-large TypeScript codebases.
2. Lower chance of missing dependent callsites.

## Cross-Cutting Safety Requirements

Apply these before exposing new tools to the model:

1. Enforce workspace path boundaries for file operations.
2. Disallow destructive operations unless explicitly requested.
3. Validate and sanitize command execution inputs.
4. Add timeout and output size limits.
5. Ensure every tool returns predictable error messages.

## Observability and Debuggability

For each tool call, capture:

1. Tool name
2. Input payload (with sensitive fields redacted)
3. Start/end timestamps
4. Success/failure status
5. Error category
6. Output length and truncation flags

This enables faster diagnosis of model/tool interaction failures.

## Evaluation Plan

Expand eval coverage in layers:

1. Tool-selection evals: verify the right tool is chosen for each prompt type.
2. Tool-correctness evals: verify deterministic outputs for fixed inputs.
3. Multi-step workflow evals: read, edit, typecheck, and re-run tests.
4. Negative/safety evals: ensure forbidden or risky actions are blocked.

Suggested acceptance gate:

1. High precision on tool selection for "golden" prompts.
2. No unsafe calls in negative safety prompts.
3. Stable results across repeated runs.

## Delivery Checklist

Use this order to keep momentum while minimizing regressions:

1. Implement `projectContext`, `searchCode`, `readFileRange`.
2. Implement `runCommand` with strict safety boundaries.
3. Implement deterministic editing (`replaceInFile` or patch-based).
4. Add `getDiagnostics` and `runTests`.
5. Add `gitStatus`, `gitDiff`, and `formatFiles`.
6. Expand eval datasets and tighten acceptance thresholds.
7. Iterate with real tasks and improve tool descriptions/schema clarity.

## Common Failure Modes and Mitigations

1. Failure mode: Tool overuse for simple explanatory questions.
   Mitigation: strengthen system prompt guidance and tool descriptions.

2. Failure mode: Excessive context returned from search/read tools.
   Mitigation: line limits, truncation metadata, and range-based reads.

3. Failure mode: Unsafe or irrelevant command execution.
   Mitigation: command allowlist patterns, cwd restrictions, timeouts.

4. Failure mode: Fragile edits due to ambiguous replacement targets.
   Mitigation: precondition checks and contextual patching.

5. Failure mode: Noisy diagnostics degrade follow-up reasoning.
   Mitigation: parse and prioritize diagnostics before returning.

## Final Notes

This roadmap is intentionally phased so you can ship value quickly:

1. First make discovery and context reliable.
2. Then make edits and validation safe and deterministic.
3. Finally add semantic and git-aware capabilities for stronger real-world performance.
