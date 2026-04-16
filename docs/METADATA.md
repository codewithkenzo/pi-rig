# Metadata

## Monorepo (Pi Rig)

### Repository description

Pi Rig monorepo for Pi coding agent plugins: Dispatch, Theme Switcher, Gateway Messaging, and Notify Cron.

### Short description

Pi coding agent plugins for execution, theming, messaging, and scheduling.

### Tagline

Practical Pi plugins for real daily runs.

### GitHub topics

- pi-coding-agent
- pi-extensions
- ai-agents
- typescript
- bun
- terminal-tools
- workflow-automation

## Plugin repositories

### `codewithkenzo/pi-dispatch`

**Description:** Queue and run Pi tasks with reusable profiles.

**Topics:**

- pi-coding-agent
- dispatch
- task-queue
- subagents
- typescript
- bun

### `codewithkenzo/pi-theme-switcher`

**Description:** Switch and preview Pi themes in a live session.

**Topics:**

- pi-coding-agent
- theme-switcher
- tui
- terminal-ui
- typescript
- bun

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
- add interactive plan mode (`/plan`) in Pi Dispatch
- draft `pi-rollback` plugin for safe recovery/undo workflows
- add richer install diagnostics and post-install checks
