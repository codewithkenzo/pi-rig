# Public go-live checklist (high priority)

Use this when flipping repos from private to public.

## 0) Launch gate

- [ ] `@codewithkenzo/pi-dispatch@0.1.1` is visible on npm
- [ ] `@codewithkenzo/pi-theme-switcher@0.1.1` is visible on npm
- [ ] README preview assets are in place (PNG/GIF/video links valid)
- [ ] no confidential files in git history (already rewritten once; re-check before launch)

## 1) Public-facing polish pass

- [ ] root README has clean install path + roadmap wording
- [ ] docs links are valid (`INSTALL`, `USAGE`, `PREVIEWS`, checklist)
- [ ] repo description + topics are final for:
  - `codewithkenzo/pi-rig`
  - `codewithkenzo/pi-dispatch`
  - `codewithkenzo/pi-theme-switcher`

## 2) Final security sweep

Run before visibility flip:

```bash
rg -n -uu "_authToken|NPM_TOKEN|NODE_AUTH_TOKEN|ChatGPT-Account-Id|account_id=" .
rg -n -uu "BEGIN [A-Z ]*PRIVATE KEY|ghp_|xoxb-" .
```

History spot-check:

```bash
git rev-list --all --count -- .claude .tickets docs/KENZO_HOUSE_SPEC.md docs/playbooks/KENZO_PUBLISHING_VOICE.md docs/PI_EXTENSION_MD_INDEX.md error.log
```

Expected: `0` for all purged paths.

## 3) Visibility flip order

Flip plugin repos first, then monorepo.

```bash
gh repo edit codewithkenzo/pi-dispatch --visibility public
gh repo edit codewithkenzo/pi-theme-switcher --visibility public
gh repo edit codewithkenzo/pi-rig --visibility public
```

## 4) Post-flip verification

- [ ] repo pages load without auth session
- [ ] npm pages open for released packages
- [ ] quick install smoke on clean shell/session
- [ ] pin key repos on profile
- [ ] add release notes / launch post links

## 5) Optional same-day follow-up

- [ ] add social preview image in repo settings
- [ ] add first GitHub release for each public repo
- [ ] open tracking issue for next wave (Gateway + Notify + board/plan convergence)

---

If anything looks off after public flip, pause announcements and fix immediately before wider sharing.
