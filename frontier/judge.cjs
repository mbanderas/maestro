#!/usr/bin/env node
// Maestro Frontier — judge stage: build prompt + invoke Opus to produce Analysis.

'use strict';

const { parseAnalysis } = require('./schema.cjs');
const dispatch = require('./dispatch.cjs');

/**
 * Build the judge prompt for Opus.
 * @param {string} userPrompt
 * @param {import('./schema.cjs').PanelResponse[]} responses
 * @param {object} cfg
 * @returns {string}
 */
function buildJudgePrompt(userPrompt, responses, cfg) {
  const sections = responses.map(
    r => `### Response from ${r.model}\n${r.content}`
  ).join('\n\n');

  const domainNote = (cfg.excluded_domains && cfg.excluded_domains.length > 0)
    ? `\nDisregard any claims sourced only from the following domains: ${cfg.excluded_domains.join(', ')}.\n`
    : '';

  return `You are a neutral JUDGE evaluating multiple AI panel responses to a user question.

USER QUESTION:
${userPrompt}

PANEL RESPONSES:
${sections}
${domainNote}
INSTRUCTIONS:
COMPARE the panel responses — do NOT merge or summarize them. Perform a structured analysis:
- consensus: points that all or most models agree on
- contradictions: topics where models disagree, with each model's specific stance
- partial_coverage: points that only some models covered (with which models)
- unique_insights: insights raised by exactly one model (with which model)
- blind_spots: important points that NO model addressed

OUTPUT IS ONLY a single JSON object with EXACTLY these keys:
  consensus (string[])
  contradictions (array of {topic: string, stances: [{model: string, stance: string}]})
  partial_coverage (array of {models: string[], point: string})
  unique_insights (array of {model: string, insight: string})
  blind_spots (string[])

No prose before or after. No markdown fence. No extra keys. Output the raw JSON object only.`;
}

/**
 * Run the judge stage. Returns Analysis or undefined on any failure (degrades gracefully).
 * @param {string} userPrompt
 * @param {import('./schema.cjs').PanelResponse[]} responses
 * @param {object} cfg
 * @param {{ spawn?: Function }} [deps]
 * @returns {Promise<import('./schema.cjs').Analysis | undefined>}
 */
async function runJudge(userPrompt, responses, cfg, deps) {
  const spawn = (deps && deps.spawn) || dispatch.spawnOne;
  let r;
  try {
    r = await spawn(
      buildJudgePrompt(userPrompt, responses, cfg),
      cfg.adapters[cfg.judgeModel],
      { timeoutMs: cfg.timeoutMs, fusionDepth: 1 }
    );
  } catch {
    return undefined;
  }

  if (!r || !r.ok || !r.content) return undefined;

  // Primary parse
  try {
    return parseAnalysis(r.content);
  } catch {
    // substring recovery: find outermost { ... }
    const first = r.content.indexOf('{');
    const last  = r.content.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return parseAnalysis(r.content.slice(first, last + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

module.exports = { buildJudgePrompt, runJudge };
