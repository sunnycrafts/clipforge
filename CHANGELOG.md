# Changelog

All notable changes to ClipForge. Versioning follows [semver](https://semver.org).

## 1.1.5

### Changed
- New app icon (film strip with play button and scissors) for the executable, installer, taskbar and window.

## 1.1.4

### Fixed
- Convert: after unticking "Save to source folder" and choosing a destination folder, the Convert All button stayed greyed out. It now enables as soon as a folder is chosen, and the status line says when an output folder is still needed.

## 1.1.3

### Added
- **Stop button** on the progress screen (also the Esc key) for every operation — convert, join, folders and cut. It stops ffmpeg immediately and deletes the half-written output file; sources are never touched.
- Convert: after Stopping, **Convert All** resumes with the files that aren't finished yet instead of starting over.

### Changed
- **Convert now starts on the Remux preset.** It re-wraps TS (and other) files into MP4 without re-encoding: seconds per file instead of minutes, no quality loss, same file size. Audio is copied too. HEVC video is tagged `hvc1` so it plays in Windows/Apple players. Pick another preset when you actually want to re-encode.

## 1.1.2

### Fixed
- **Convert tab layout:** the tab was taller than the window and couldn't scroll, so added files and the Convert button were pushed off-screen and it looked like nothing happened. The queue now sits directly under the drop zone, the tab scrolls, and the Convert button/options stay pinned at the bottom.
- Drop-zone hint on the Convert tab now lists TS.

## 1.1.1

### Fixed
- Convert tab: dropping a **folder** now works (scanned recursively for video/audio) instead of being rejected, and no longer jumps you to the Folders tab.
- Convert tab: files appear in the queue immediately and their info loads in the background, instead of the queue staying empty until every file had been read — which made large batches look like they weren't recognised.

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
