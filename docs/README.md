# Pi Rig documentation

## Start here

- [Install](./INSTALL.md)
- [Install prompts for agents](./INSTALL_PROMPTS.md)
- [Usage](./USAGE.md)
- [Telegram pairing](./TELEGRAM_PAIRING.md)
- [Metadata](./METADATA.md)
- [Architecture notes](./architecture/next-spec-synthesis.md)

## Scope

This folder is the public-facing documentation surface for Pi Rig:

- installation and setup
- copyable install prompts for agents
- command and tool usage
- transport-specific guides
- package behavior that matters to users and contributors
- metadata, release copy, and distribution notes

## Package overview

### Pi Dispatch

Profile-based execution for queued subagent work, reusable task envelopes, and future flow-driven planning.

### Theme Switcher

Runtime theme switching and preview.

### Gateway Messaging (source preview)

Telegram-first turn runtime with patch queues, structured actions, and compact remote updates.

### Notify Cron (source preview)

Scheduled notifications with explicit destinations and lease-aware ticking.

## Reading order

1. install Pi Rig or the packages you want
2. verify the command surfaces in the Pi coding agent
3. pair Telegram if you want remote messaging workflows
4. explore package-specific commands from the usage guide

## Coming next

The public docs surface will expand with:

- screenshots and short video clips
- theme palette previews for Theme Switcher
- configuration flags and optional dependencies by package
- side-by-side examples for cloud install and source install
