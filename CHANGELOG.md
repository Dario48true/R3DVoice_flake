# RedVoice Changelog

## v0.9.0 — 2026-04-30

### Added
- Profile pictures via URL — Settings → Account → Profile picture URL (https only, ≤2048 chars)
- Auto-generated handles at signup — no more manual handle picker for new users
- "What's new" link in Settings → About, opens GitHub releases
- Update toast on first launch after autoupdate
- 4K-friendly UI sizing — base font bumped 15px → 16px

### Fixed
- chat-transport now caches per-thread mute level instead of hardcoded "all"
- FriendsPane "in <Room>" link actually joins the room
- Login error reads "Incorrect email or password" instead of "login failed"
- WebSocket reconnect loop no longer spins forever on stale auth tokens (close code 4401)

### Removed
- In-app Changelog tab (replaced by Settings → About → "What's new" link to GitHub)
- Dead `FeaturesPanel.tsx` component (339 lines)

### Internal
- Unified `<Avatar>` component replaces ad-hoc initials circles across the UI
- DOM test infrastructure (jsdom + @testing-library/react) added for client component testing
- 17-task implementation plan tracked at docs/superpowers/plans/2026-04-30-plan4a-polish-and-avatars.md
