---
name: gateway-messaging
description: Use this skill to operate gateway turn messaging (status, preview, action-safe updates) with one primary message per turn.
---

# gateway-messaging operator skill

## Use when

- you need turn preview + queue diagnostics
- you want action-safe callback payload handling
- you need readable tool-stream rollups without chat spam

## Command

- `/gateway status`

## Tool

- `gateway_turn_preview`

## Action policy

- use versioned action payloads (`v: 1`)
- valid actions: `retry`, `details`, `approve`, `cancel`
- reject expired/stale/unauthorized actions

## Rendering policy

- one primary turn message owner
- coalesced updates under throttle
- no-op patch suppression
