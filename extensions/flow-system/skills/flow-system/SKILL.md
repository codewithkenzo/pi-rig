---
name: flow-system
description: Use when running work in named pi flow profiles, especially for background subagent jobs, profile-based execution, or queue-aware /flow commands.
---

# flow-system

Use this skill when the task should be delegated through pi flow profiles instead of handled as an undifferentiated prompt.

## Hard requirements (apply first)

- Always pass `model` and `reasoning` (or `effort`) on every `flow_run`.
- Always pass `model` and `reasoning` (or `effort`) on every item in `flow_batch`.
- Do not rely on implicit defaults when invoking flows from this skill.
- Treat profile choice + model + reasoning as one required decision.

## Profile routing defaults (Codex-aligned)

Use these as default pairings unless user explicitly overrides:

| Intent lane | Flow profile | Model | Reasoning / effort |
|---|---|---|---|
| fast explore / grep / map | `explore` | `gpt-5.4-mini` | `low` |
| research synthesis | `research` | `gpt-5.4-mini` | `medium` |
| builder / implementation | `coder` | `gpt-5.4-mini` | `high` |
| reviewer / hard audit | `debug` (or custom `reviewer`) | `gpt-5.4` | `xhigh` |

If provider differs, keep same intent shape:
- explore lane -> fastest cheap model with low reasoning
- research lane -> balanced small model with medium reasoning
- builder lane -> reliable coding model with high reasoning
- reviewer lane -> strongest reasoning model with xhigh reasoning

## Provider/model discovery before first flow

Use current auth/settings state before selecting model/provider:

```bash
jq -r 'keys[]' ~/.pi/agent/auth.json
jq -r '.defaultProvider, .defaultModel, .defaultThinkingLevel' ~/.pi/agent/settings.json
```

If running from Codex and you want local model cache hints:

```bash
jq -r '.models[].slug' ~/.codex/models_cache.json | head -n 80
```

Then pick a concrete `provider` + `model` pair and pass it explicitly in the flow call.

## Required call shape

Minimum shape for this skill:

```json
{
  "profile": "explore|research|coder|debug",
  "task": "<concrete task>",
  "model": "<provider model id or provider/model>",
  "provider": "<optional when model already provider-prefixed>",
  "reasoning": "low|medium|high|xhigh"
}
```

`effort` may be used instead of `reasoning`, but one of them must always be present.

## What it provides

- `flow_run` for a single task
- `flow_batch` for sequential or parallel batches
- `/flow` opens the flow management overlay
- `/flow status|cancel|profiles|run|pick` for job inspection and control
- `alt+shift+f` opens the same management overlay

## Working guidance

- Pick the smallest useful profile first.
- Apply profile routing defaults above before writing task prompt.
- Use background jobs for long-running exploration or research.
- Use `/flow` when you want live inspection, quick cancel, or to browse active jobs without leaving the chat band.
- Check `/flow profiles` before assuming which tools or reasoning level a profile uses.
- Check `/flow status` before starting duplicate jobs.
- The compact flow deck should stay flow-only: avoid reintroducing unrelated status noise into the bar/widget.

## Output style

When reporting a flow result, include:

1. profile used
2. whether it ran foreground or background
3. the key result or failure
4. the follow-up command when the user needs more detail
