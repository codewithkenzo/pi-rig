---
name: flow-system
description: Use when running work in named pi flow profiles, especially for background subagent jobs, profile-based execution, or queue-aware /flow commands.
---

# flow-system

Use this skill when the task should be delegated through pi flow profiles instead of handled as an undifferentiated prompt.

## What it provides

- `flow_run` for a single task
- `flow_batch` for sequential or parallel batches
- `/flow status|cancel|profiles` for job inspection and control

## Working guidance

- Pick the smallest useful profile first.
- Use background jobs for long-running exploration or research.
- Check `/flow profiles` before assuming which tools or reasoning level a profile uses.
- Check `/flow status` before starting duplicate jobs.

## Output style

When reporting a flow result, include:

1. profile used
2. whether it ran foreground or background
3. the key result or failure
4. the follow-up command when the user needs more detail
