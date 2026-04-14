---
name: notify-cron
description: Use this skill to operate scheduled notifications (create/update/list/tick/remove jobs) with explicit DM/topic/channel ids.
---

# notify-cron operator skill

## Use when

- you need scheduled plan/ticket/status notifications
- you want destination-safe delivery (explicit ids)
- you need retries without duplicate visible sends

## Core commands

- `/notify-cron status`
- `/notify-cron tick`

## Core tools

- `notify_cron_upsert`
- `notify_cron_tick`
- `notify_cron_list`
- `notify_cron_remove`

## Destination formats

- `telegram:<chat_id>`
- `telegram:<chat_id>:<thread_id>`
- `discord:<channel_or_thread_id>`

## Notes

- If destination ids are missing/invalid, configuration should fail closed.
- Tick execution uses lease + idempotency to avoid duplicate sends.
