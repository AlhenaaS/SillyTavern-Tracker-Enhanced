# Locale Contribution Guide

This extension now asks SillyTavern for the authoritative locale catalogue at runtime. Dropping a matching JSON pair into `locales/` and `presets/` is enough for Tracker Enhanced to expose a new language—no code changes needed. This guide spells out the expectations for translators and reviewers.

## Supported Locale IDs

SillyTavern currently exposes the following locale identifiers. The extension always keeps `en` as the hard fallback.

| Locale ID | Display Name |
| --- | --- |
| en | English (fallback) |
| ar-sa | عربي (Arabic) |
| zh-cn | 简体中文 (Chinese) (Simplified) |
| zh-tw | 繁體中文 (Chinese) (Taiwan) |
| nl-nl | Nederlands (Dutch) |
| de-de | Deutsch (German) |
| fr-fr | Français (French) |
| is-is | íslenska (Icelandic) |
| it-it | Italiano (Italian) |
| ja-jp | 日本語 (Japanese) |
| ko-kr | 한국어 (Korean) |
| pt-pt | Português (Portuguese brazil) |
| ru-ru | Русский (Russian) |
| es-es | Español (Spanish) |
| uk-ua | Українська (Ukrainian) |
| vi-vn | Tiếng Việt (Vietnamese) |
| th-th | ไทย (Thai) |

> **Need a new locale?** Add it to SillyTavern first (so it appears in `translationManager.getAvailableLocales()`), then follow the file guidelines below.

> Maintainers review any pull requests that add new locales. Feel free to fork or keep custom translations locally—upstream merges are vetted for accuracy and structure. The extension reads SillyTavern’s locale registry (via `translationManager` when available, or `/locales/lang.json` as a fallback) each time it loads.

## File Layout & Naming Rules

- Use the exact locale ID (lowercase, hyphen-delimited) for both files:
	- `locales/<locale>.json` – UI strings. Keys must appear in the same order as `locales/en.json`.
	- `presets/<locale>.json` – preset snapshot. Structure must mirror `presets/en.json`, including field IDs and metadata.
- Keep files UTF-8 encoded with no BOM. Avoid trailing commas—these JSON bundles ship directly to the browser.
- Retain placeholder tokens and Handlebars helpers (`{{participants}}`, `{{#foreach}}`, etc.) exactly as they appear in English.
- Prefer editing with a formatter that preserves ordering; rearranged keys cause noisy diffs and make translation reviews harder.

## Translation Checklist

1. Copy `locales/en.json` → `locales/<locale>.json` and `presets/en.json` → `presets/<locale>.json`.
2. Translate values while keeping key order and metadata untouched.
3. Save the files with Unix newlines. If you plan to submit them upstream, stage the changes in Git; otherwise keep them local—forks and personal copies are absolutely fine.
4. Reload the extension via **Settings → Extensions → Reload** (or restart SillyTavern) to pick up the new bundles.
5. Switch SillyTavern’s UI language or use the Tracker Enhanced language override to confirm the locale appears and renders correctly.

## Validation Tips

- Quick JSON sanity check (fails fast on syntax issues):
	```bash
	jq empty locales/<locale>.json
	jq empty presets/<locale>.json
	```
- Runtime verification after reloading:
	```js
	// In the browser devtools console
	const ctx = SillyTavern.getContext();
	ctx.translationManager.getAvailableLocales().find(x => x.id === "<locale>");
	```
- Watch the console for `[tracker-enhanced]` warnings about missing locale or preset files—those indicate a naming mismatch or syntax error. The extension will fall back to English automatically, but the warning must be resolved before shipping.

## Failure Behaviour

If either file is missing or invalid:

- A warning is logged once with the failing locale and attempted filenames.
- UI strings fall back to English (the tracker remains usable).
- Preset seeding skips the broken locale and continues populating other entries. Users stay on the English snapshot unless a valid locale preset exists.

Resolve the warnings, reload the extension, and re-run the validation steps above. Once the console is clean and the dropdown shows the new locale, you are ready to submit the translation.
