// Tier 3 LLM call (docs/08 BE-01). The key lives only here (SEC-05). Responses are validated
// against the fixed schema; anything else becomes "unsure" (CLS-14).

import OpenAI from "openai";
import {
  isTodo,
  LLM,
  parseJudgeResponse,
  parseLabelResponse,
  UNSURE,
  type Tier3JudgeResponse,
  type Tier3LabelResponse,
  type Tier3Request,
} from "@lockin/core";
import { dataBlock, JUDGE_SCHEMA, LABEL_SCHEMA, SYSTEM_PROMPTS } from "./prompt";

/** Returns the model's raw text output, or throws on transport failure. */
export type LlmTransport = (args: { system: string; data: string; schemaName: string; schema: Record<string, unknown> }) => Promise<string>;

export class LlmUnavailable extends Error {}

export function openAiTransport(apiKey: string): LlmTransport {
  const effort = LLM.API_REASONING_EFFORT;
  const client = new OpenAI({ apiKey });
  return async ({ system, data, schemaName, schema }) => {
    // The lowest reasoning value for the model is unconfirmed (Q-60); no guessed default.
    if (isTodo(effort)) throw new LlmUnavailable("reasoning effort undecided (TODO_Q60)");
    const res = await client.responses.create({
      model: LLM.API_MODEL_ID,
      reasoning: { effort },
      store: LLM.STORE_RESPONSES,
      input: [
        { role: "system", content: system },
        { role: "user", content: data },
      ],
      text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
    });
    return res.output_text;
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function runJudge(transport: LlmTransport, req: Tier3Request): Promise<Tier3JudgeResponse> {
  const kind = req.kind === "override" ? "override" : "judge";
  const text = await transport({ system: SYSTEM_PROMPTS[kind], data: dataBlock(req), schemaName: "verdict", schema: JUDGE_SCHEMA });
  return parseJudgeResponse(parseJson(text)) ?? UNSURE;
}

export async function runInferLabel(transport: LlmTransport, req: Tier3Request): Promise<Tier3LabelResponse | null> {
  const text = await transport({ system: SYSTEM_PROMPTS.infer_label, data: dataBlock(req), schemaName: "task_label", schema: LABEL_SCHEMA });
  return parseLabelResponse(parseJson(text));
}
