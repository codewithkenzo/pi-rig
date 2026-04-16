# Metadata

## Monorepo (Pi Rig)

### Repository description

Pi coding agent plugin monorepo: Dispatch, Theme Switcher, plus upcoming sandbox/memory/voice plugins.

### Short description

Pi coding agent plugins for execution, theming, messaging, and scheduling.

### Tagline

Practical Pi plugins for real daily runs.

### GitHub topics

- pi-coding-agent
- pi-extensions
- ai-agents
- agent-orchestration
- workflow-automation
- terminal-tools
- developer-tools
- task-queue
- theme-switcher
- telegram-bot
- cron-jobs
- bun
- typescript

## Plugin repositories

### `codewithkenzo/pi-dispatch`

**Description:** Run queued Pi tasks with reusable profiles.

**Topics:**

- pi-coding-agent
- agent-orchestration
- dispatch
- task-queue
- subagents
- workflow-automation
- vfs
- bun
- typescript

### `codewithkenzo/pi-theme-switcher`

**Description:** Switch and preview Pi themes during live sessions.

**Topics:**

- pi-coding-agent
- theme-switcher
- terminal-ui
- tui
- ansi
- developer-tools
- bun
- typescript

## Package descriptions

### `@codewithkenzo/pi-rig`

One-command installer for Pi Dispatch and Theme Switcher.

### `@codewithkenzo/pi-dispatch`

Queue and run Pi tasks with reusable profiles.

### `@codewithkenzo/pi-theme-switcher`

Switch and preview Pi themes in a live session.

### `@codewithkenzo/pi-gateway-messaging`

Telegram turn updates and action routing for Pi. (Coming soon)

### `@codewithkenzo/pi-notify-cron`

Scheduled notifications for Pi with lease-aware ticks. (Coming soon)

## Package keywords

### `@codewithkenzo/pi-rig`

- pi
- pi-coding-agent
- installer
- cli
- extensions

### `@codewithkenzo/pi-dispatch`

- pi
- pi-coding-agent
- dispatch
- task-queue
- subagents

### `@codewithkenzo/pi-theme-switcher`

- pi
- pi-coding-agent
- theme
- theme-switcher
- tui

## Next feature phases

### Phase 1 (now)

- publish `@codewithkenzo/pi-dispatch`
- publish `@codewithkenzo/pi-theme-switcher`
- ship `@codewithkenzo/pi-rig` installer with only available plugins

### Phase 2 (next)

- finish package hardening for Gateway Messaging
- finish package hardening for Notify Cron
- add clear installer badges for "available" vs "coming soon"

### Phase 3 (after)

- add `pi-memory` MVP (short + long memory lanes)
- add `fs-sandbox` execution isolation plugin
- add `pi-board` coordination plugin (includes integrated plan-mode UX)
- add `pi-diff` structured diff plugin
- add `pi-voice` voice/transcript plugin
- draft `pi-rollback` plugin for safe recovery/undo workflows
- ship `/plan` flow in Pi Dispatch as the bridge into pi-board workflow
- deepen VFS preload + sandbox adapter integration in Pi Dispatch
- add richer install diagnostics and post-install checks
