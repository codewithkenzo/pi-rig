# Preview asset guide (WIP)

Use this while preparing colorful preview media before public launch.

## Suggested structure

```text
docs/previews/
  dispatch/
    hero.png
    flow-deck.png
    flow-run.gif
  theme-switcher/
    hero.png
    theme-cycle.gif
  social/
    pi-rig-og.png
```

## Naming rules

- lowercase, kebab-case
- include package context in filename when ambiguous
- keep a stable filename for README embeds (replace file content, not filename)

## README embed template

```md
## Preview

![Pi Dispatch flow deck](./docs/previews/dispatch/flow-deck.png)
![Theme Switcher live cycle](./docs/previews/theme-switcher/theme-cycle.gif)
```

## Optional video section

```md
## Demo videos

- [Pi Dispatch walkthrough](https://your-video-link)
- [Theme Switcher walkthrough](https://your-video-link)
```

## Final pre-launch media checks

- all preview links resolve in GitHub markdown
- image sizes are reasonable (avoid huge raw files)
- no terminal output leaks secrets/tokens/user IDs
- thumbnails and social image look good in dark mode
