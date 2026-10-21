# Changelog

All notable changes to ClipForge. Versioning follows [semver](https://semver.org).

## 1.1.0

### Added
- **MPEG-TS support everywhere.** `.ts`, `.mts` and `.m2ts` files are now accepted in Files, Folders, Cut and Duplicates — file pickers, drag-and-drop and folder scans (previously only the Convert tab took them).
- In-app version history: click the version number in the title bar to see this changelog. The version is also shown in the window title.

### Fixed
- Joining or trimming damaged TS captures no longer aborts (ffmpeg exit 183) or silently truncates the output; join and trim now discard corrupt packets and carry on.
- Cut tab suggests an `.mp4` output name for TS sources.

## 1.0.1

### Fixed
- Folders tab scans recursively, so NVR/DVR exports with hourly subfolders (e.g. `2026Y08M20D00H`) are found, joined in chronological order.
- Joining a folder set with no video files shows a clear message and disables Join, instead of crashing ffmpeg with an empty file list.

## 1.0.0

- Initial release: Files, Folders, Cut, Duplicates and Convert tabs.
