// The contract between this repository and ReviewBot: the rules.yaml schema.
//
// VENDORED from the agent-platform repository, package `@agent-platform/standards-schema` 0.1.0 (schema
// version 1): the same version number, rule id pattern, minimum rule length, severity values and tokenisation
// that ReviewBot enforces when it reads standards/rules.yaml, so the generator rejects exactly what ReviewBot
// would reject. Do not change the limits here. A change to any of them is a new schema version made in
// agent-platform first, then copied over, together with scripts/standards/standards-rules.v1.json, whose
// SHA-256 is pinned in scripts/standards.test.mjs so an accidental edit is caught.

export const STANDARDS_RULES_SCHEMA_VERSION = 1;

/** `ADR-0012-R1`: letters, a document number, then `R` and the rule's ordinal. */
export const RULE_ID_PATTERN = /^[A-Za-z]+-\d+-R\d+$/;

/** Rule text shorter than this many tokens is rejected: too vague to check from a diff. */
export const MIN_RULE_TEXT_TOKENS = 8;

export const RULE_SEVERITIES = ["error", "warning"];

/**
 * Unicode NFKC, lower-cased, then maximal runs of Unicode letters and digits. Markdown and code punctuation,
 * line breaks and repeated whitespace only separate tokens.
 */
export function tokenize(text) {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Returns a list of problems with one rule (empty when it is valid). `where` names the rule in messages. */
export function checkRule(rule, where) {
  const problems = [];
  if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
    return [`${where}: a rule must be an object`];
  }
  if (typeof rule.id !== "string" || !RULE_ID_PATTERN.test(rule.id)) {
    problems.push(`${where}: id must look like ADR-0012-R1`);
  }
  if (!RULE_SEVERITIES.includes(rule.severity)) {
    problems.push(`${where}: severity must be one of ${RULE_SEVERITIES.join(", ")}`);
  }
  if (
    !Array.isArray(rule.appliesTo) ||
    rule.appliesTo.length === 0 ||
    rule.appliesTo.some((g) => typeof g !== "string" || g.length === 0)
  ) {
    problems.push(`${where}: appliesTo must be a non-empty list of glob strings`);
  }
  if (typeof rule.text !== "string") {
    problems.push(`${where}: text must be a string`);
  } else if (tokenize(rule.text).length < MIN_RULE_TEXT_TOKENS) {
    problems.push(
      `${where}: text must contain at least ${MIN_RULE_TEXT_TOKENS} words (make the rule specific enough to check from a diff)`,
    );
  }
  if (typeof rule.source !== "string" || rule.source.length === 0) {
    problems.push(`${where}: source must be a non-empty string`);
  }
  return problems;
}

/** Validates a whole rules file. Returns a list of problems (empty when it is valid). */
export function checkRulesFile(file) {
  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    return ["the rules file must be an object"];
  }
  if (file.version !== STANDARDS_RULES_SCHEMA_VERSION) {
    return [`unsupported rules file version ${JSON.stringify(file.version)}, expected ${STANDARDS_RULES_SCHEMA_VERSION}`];
  }
  if (!Array.isArray(file.rules)) return ["rules must be a list"];
  return file.rules.flatMap((rule, i) => checkRule(rule, `rules[${i}]${rule?.id ? ` (${rule.id})` : ""}`));
}
