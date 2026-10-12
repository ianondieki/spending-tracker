/**
 * @hesabu/agents: the report workflow's model steps (insight-select, write, judge, extract), the deterministic
 * fact-checker, the numbers-only fallback writer, redaction, and cost caps. Every model call goes through a
 * `ModelClient`; tests use `FakeModelClient` and never reach a real model.
 */

/** Workflow steps in order. Only `insight-select` and `write` may call a model; the rest are deterministic. */
export const WORKFLOW_STEPS = [
  'collect',
  'insight-select',
  'write',
  'check',
  'render',
  'deliver',
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export * from './contracts/report-document.js';
export * from './cost.js';
export * from './env.js';
export * from './extract.js';
export * from './fact-check.js';
export * from './fallback-writer.js';
export * from './insight-select.js';
export * from './judge.js';
export * from './model-client.js';
export * from './pipeline.js';
export * from './prompt-data.js';
export * from './prompts/index.js';
export * from './redact.js';
export * from './write.js';
