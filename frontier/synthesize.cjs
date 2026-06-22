#!/usr/bin/env node
// Maestro Frontier — synthesis stage: build prompt + invoke the configured synth model for the final answer.

'use strict';

const dispatch = require('./dispatch.cjs');

/**
 * Build the synthesis prompt for the synthesizer.
 * @param {string} userPrompt
 * @param {{ analysis?: import('./schema.cjs').Analysis, responses: import('./schema.cjs').PanelResponse[] }} bundle
 * @param {object} cfg
 * @returns {string}
 */
function buildSynthPrompt(userPrompt, bundle, cfg) {
  const antiMajority =
    'Do NOT majority-vote or pick the most common answer; weigh correctness and evidence — ' +
    'a single correct minority response outweighs a popular wrong one.';

  let groundingSection;
  if (bundle.analysis) {
    groundingSection =
      `PANEL ANALYSIS (structured):
${JSON.stringify(bundle.analysis, null, 2)}

Ground your final answer in this analysis:
- Adopt the consensus points as established facts.
- RESOLVE contradictions by reasoning about which stance is most correct; do not dodge them.
- Preserve unique insights that add value.
- Address any blind spots the analysis identified.`;
  } else {
    const raw = bundle.responses.map(
      r => `### Response from ${r.model}\n${r.content}`
    ).join('\n\n');
    groundingSection =
      `RAW PANEL RESPONSES:
${raw}

Ground your final answer in these responses.`;
  }

  return `You are a SYNTHESIZER producing the definitive final answer to a user question.

USER QUESTION:
${userPrompt}

${groundingSection}

IMPORTANT: ${antiMajority}

Write the final answer as clear, direct prose. No JSON, no meta-commentary, no preamble about your process. Output the answer only.`;
}

/**
 * Run the synthesis stage. Returns the final answer string or '' on failure (degrades gracefully).
 * @param {string} userPrompt
 * @param {{ analysis?: import('./schema.cjs').Analysis, responses: import('./schema.cjs').PanelResponse[] }} bundle
 * @param {object} cfg
 * @param {{ spawn?: Function }} [deps]
 * @returns {Promise<string>}
 */
async function runSynth(userPrompt, bundle, cfg, deps) {
  const spawn = (deps && deps.spawn) || dispatch.spawnOne;
  let r;
  try {
    r = await spawn(
      buildSynthPrompt(userPrompt, bundle, cfg),
      cfg.adapters[cfg.synthModel],
      { timeoutMs: cfg.timeoutMs, fusionDepth: 1 }
    );
  } catch {
    return '';
  }

  if (r && r.ok && r.content) return r.content;
  return '';
}

module.exports = { buildSynthPrompt, runSynth };
