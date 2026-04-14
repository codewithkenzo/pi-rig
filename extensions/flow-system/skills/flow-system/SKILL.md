---
name: flow-system
description: Use when running work in named pi flow profiles, especially for background subagent jobs, profile-based execution, or queue-aware /flow commands.
---

# flow-system

Use this skill when the task should be delegated through pi flow profiles instead of handled as an undifferentiated prompt.

## What it provides

- `flow_run` for a single task
- `flow_batch` for sequential or parallel batches
- `/flow` opens the flow management overlay
- `/flow status|cancel|profiles|run|pick` for job inspection and control
- `alt+shift+f` opens the same management overlay

## Working guidance

- Pick the smallest useful profile first.
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
