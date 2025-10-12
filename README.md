# SillyTavern Tracker Enhanced Extension

An advanced, feature-rich tracker extension for SillyTavern that provides comprehensive character and scene monitoring with intelligent automation, drag-and-drop field management, and dynamic template generation.

## Changelog
12-10-2025
- Added a new preset-maintenance pipeline:
	- Built-in schemas now auto-refresh from their bundled templates to ensure they always reflect the latest defaults shipped with each update.
	- When an outdated custom preset is detected, it is automatically renamed to ❌ Backup ….    
	You can still load or export these backups to review their contents, but note that compatibility issues may occur.
- Added locales for the prompt maker.
- Replaced the legacy schema prefix/upgrade helpers with a single canonical `trackerDef` in `defaultSettings.js`; bundled presets (including zh-CN) now ship with the same field IDs and metadata as the default.

11-10-2025
- Refined time management: new `TimeAnchor` / `LocalTime` pair with automated `TimeAnalysis` to track elapsed time between turns while keeping flavour text public.
- Tracker interface and save pipeline now preserve internal timing data, so manual edits and regenerations retain the parsed anchor instead of falling back to “No TimeAnchor provided.”
- Separates time into `TimeAnchor` (internal ISO-8601 timestamp) and `LocalTime` (public flavour text) so the tracker can advance clocks while keeping RP-friendly descriptions.
- Automatically tracks elapsed time via `TimeAnalysis`, storing anchor, epoch milliseconds, elapsed seconds/days, and timeline notes for downstream systems.
- LocalTime prompts remind the model to mirror each new anchor with setting-appropriate calendars or colloquial timekeeping, keeping narrative continuity.

10-10-2025
- Tracker reconciliation now strips internal-only StoryEvents from the public payload while preserving the raw data in `chat[mesId].trackerInternal` for diagnostics and exports.
- Added a “Show Internal Events” toggle to the tracker interface so power users can inspect captured birth/growth/death events without exposing them to the roleplay LLM.
- Normalized scalar handling during reconciliation so numeric and boolean values (like `Age: 18`) persist instead of reverting to placeholder prompts.
- UI rendering no longer shows placeholder StoryEvents entries; true lifecycle events will surface in the internal view when present.
- Overhauled the tracker prompt-building pipeline and removed the flawed example-building helpers. New schema-driven guidance covers every example without redundancy and trims token usage.  
- Replaced the old “Add Example Field” and “Remove Example Field” buttons with per-field controls so you can choose how many examples each field exposes.
- Added participant policy helper that seeds `CharactersPresent`/`Characters` defaults and injects locale-aware guidance into generation prompts.
- Character description prompts now expand macros before formatting so `{{char}}` tokens resolve correctly in tracker requests.
- Removed the original guide from the docs folder because it was badly outdated. I might add a new Markdown version later—no promises.

06-10-2025
- Introduced metadata for the tracker schema and object. Entries are now flagged as internal or external.    
- Introduced `internalKeyId` for field anchoring so we can expand this extension to call internal functions based on tracking results later.
- Embedded tracker field metadata directly into `src/settings/defaultSettings.js` and shipped presets, eliminating the hidden override map.
- Added a one-click metadata upgrade prompt (and `window.trackerEnhanced.upgradeTrackerMetadata()` helper) for legacy presets that still lack embedded metadata.
- Tracker regeneration and slash command defaults now send the complete schema (`include=all`) so internal-only fields remain available to the tracker LLM.
- Introduced a `StoryEvents.BirthEvents` structure so regeneration captures completed births; entries are parsed and logged for upcoming automation hooks.
- Introduced `StoryEvents.BirthEvents`, `StoryEvents.GrowthEvents`, and `StoryEvents.DeathEvents` so regeneration captures lifecycle updates; entries are parsed and logged for upcoming automation hooks.

05-10-2025
- Added a configurable **“Roleplay Injection Prompt”**, allowing injected tracker payloads to begin with a short guidance line.  
  - This helps the roleplay LLM understand the purpose of the tracker.  
- Removed **Inline** and **Two-Stage** generation models, along with their pipelines and settings.  
  - *Inline* simply injected into the main chat and asked the roleplay LLM to handle the tracker task, which was counterintuitive since it bypassed our independent connection.  
  - *Two-Stage* sent two requests, which I never found useful.  
  - Both were removed to simplify pipelines and settings.
- Add locale support for Simplified Chinese.

02-10-2025
- Added AGPL-3.0 LICENSE file (based on SillyTavern’s official license).
- Added debug log marker 💉 to indicate when prompt injection occurs.
- As requested, added tracker injection toggle, this only toggles injection, the tracker still runs:
   - New checkbox in the tracker menu.
   - New slash command `/toggle_tracker_injection` (alias `/ttj`).
   - Toolbar indicator (green/red) to show toggle status, can be hidden in settings.
   - Toggling off injection also clears the “stale” tracker cache in SillyTavern’s `extension_prompts`.
- Simplified UI:
   - Changed "Generate Template" button to plain style.
   - Removed redundant "Generate Message Template" in prompt maker (same call).
- Updated the tracker panel grip ID in src/ui/trackerInterface.js:51 so it now resolves to trackerEnhancedInterfaceheader, matching what dragElement() looks for; MovingUI can again hook
  the header and drag the panel.


01-10-2025
- Clean up connection profile/completion preset usages.
- Tracker now reuses completion presets end-to-end, copying temperature, top_p/top_k, penalties, stop strings, and max tokens into the independent request.
- Tracker requests now disable instruct templates so only the extension prompt is sent. 
- Here is a clarifation of what is actually being used or ignored:
  - Uses: API/model selection, connection profile proxy settings, and completion preset knobs (temperature, top_p/top_k, penalties, stop strings, max tokens).
  - Ignores: preset prompt snippets, instruct templates, and context-size hints (tracker builds its own prompt and leaves instruct off).

28-09-2025
- No longer automatically send a tracker generation request when you merely open an old chat.
   - This is because SillyTavern uses dry-run during reconstruction of a chat page when you open an old chat. The extension treated it as a real new message. The original likely behaved the same way; I just added a guard.
   - This should save one tracker generation every time you open an old chat.
- Added groundwork for the upcoming narrative lifecycle system (character birth → growth → death) in `src/sillyTavernHelper.js` and `src/ui/developmentTestUI.js`.

## 🚀 Enhanced Features

This enhanced version significantly expands upon the original tracker with major improvements and new capabilities:

### 🎯 **Advanced Prompt Maker System**
- **Smart Positioning**: Automatic scroll adjustment during drag operations in long forms 
- **Auto-Template Generation**: One-click HTML template generation from your field definitions
- **Auto-JavaScript Generation**: Dynamic gender-specific field hiding with intelligent detection
- **New Default Entries for Cultured People**: Fertility Cycles and Pregnancy simulation 🥵  
- **Gender-Specific Fields**: Configurable field visibility based on character gender (all, female, male, trans)

### 🔄 **Independent Connection System**  
- **Non-Disruptive Operation**: Maintains separate connection from main SillyTavern API
- **No Connection Interference**: Never switches or interrupts your primary chat connection
- **Profile Transport Reuse**: Borrow the profile's API/model settings while keeping the main chat pipeline untouched
- **Reliable Background Processing**: Stable tracker generation without affecting chat flow
- **Smart Connection Management**: Automatic fallback and recovery mechanisms

### 🕒 **Time Management**
- **Immersive Local Time with Internal Accuracy** Present immersive, setting-aware time descriptions to the user while tracking a precise ISO-8601 `TimeAnchor` internally for elapsed-time math.
- **Best of both worlds** Internal-only `TimeAnalysis` captures anchor, epoch milliseconds, elapsed seconds/days, and timeline notes so downstream systems (pregnancy, cooldowns, etc.) can react without exposing numeric clutter in roleplay.
- **Narrative driven time advancement** When the LLM omits an anchor, the system preserves the previous one, keeping timeline-driven features stable while still prompting the model to advance time in future turns.

## 🎮 **How to Use**

### 1. **Setting Up Fields**
1. Open SillyTavern Settings → Extensions → Tracker Enhanced
2. Click **"Prompt Maker"** to open the field editor
3. **Add Fields**: Use "Add Field" to create tracker properties
4. **Configure Fields**: Set name, type, presence, and gender-specific visibility
5. **Drag & Drop**: Reorder fields by dragging with the hamburger icon ☰

### 2. **Generating Templates**
1. After defining your fields, click **"Generate Template"**
2. The HTML template will be automatically created and applied
3. Preview how your tracker will appear in messages
4. Customize the generated template if needed

### 3. **Setting Up Gender-Specific Fields**
1. In Prompt Maker, select any character field
2. Use the **"Gender Specific"** dropdown:
   - **All Genders**: Show for everyone (default)
   - **Female Only**: Show only for female characters
   - **Male Only**: Show only for male characters  
   - **Trans Only**: Show only for trans characters
3. Click **"Generate JavaScript"** to create hiding logic
4. Fields will automatically hide based on character gender

### 4. **Understanding Preset Compatibility**
Unlike core SillyTavern, the tracker call runs on a detached request channel. We still read your chosen connection profile so the tracker uses the same API/model, but we never swap the active chat profile while the request is in flight.
When the completion preset dropdown stays on **Use connection profile default**, the tracker reuses whatever preset is already attached to that profile. Picking a named preset validates it against the matching preset manager, temporarily applies it for the tracker request, and then restores your original profile afterwards. If the preset is missing or incompatible, we log a warning and fall back to the profile preset.
- Tracker copies the preset's generation knobs (temperature, top_p, top_k, penalties, stop strings, max tokens, etc.) into the independent request.
- Tracker requests always disable instruct templates so only the extension's prompt is sent.
When selecting a "Dedicated Completion Preset", you'll see compatibility indicators:
- **✅ Compatible**: Preset matches your connection profile's API - recommended for best results
- **⚠️ May have issues**: Preset may work but could have parameter conflicts - use with caution  
- **❌ Likely incompatible**: Preset is for a different API and may cause errors - not recommended

*Tip: You can still use any preset, but compatible ones will provide the most reliable results.*

## 📚 **Migration from Original**

- I recommend using only the original or my enhanced version - choose one. 

## 🛠️ **Troubleshooting**

### Common Issues:
- **Fields not hiding**: Click "Generate JavaScript" after changing gender-specific settings
- **Alignment problems**: The enhanced alignment system fixes table spacing automatically
- **Connection issues**: The enhanced version uses independent connections - no interference
- **Template errors**: Use "Generate Template" to create properly formatted HTML
- **Preset compatibility warnings**: Choose presets with ✅ indicators for best results, or create new presets optimized for your connection profile
- **Token cost too high**: 
   - There is no reason to use your expensive LLM API such as gemini or claude for the tracker. Keep them for the main connection and use a cheap one like deepseek for tracker. 
   - The default "Number of Recent Messages to Include" is 5, which on average uses about 9k tokens per tracker generation in my use case. This also depends on how long your messages are on average. Reduce the number of messages to include if you find it too high. 
   - If you keep the default, for every 100 messages, the tracker will use about 1m tokens; for DeepSeek that's about $0.30. 
- **Something else breaks**: 
   - 99% of the time, it's your connection profile problem. Use something clean with no extra prompts. 
   - For conflicts with other extensions, please don't report to me. It's not fair. I fork this for my own use. Fork your own and do whatever you want.  

## 📜 **Credits**

- **SillyTavern**: https://github.com/SillyTavern/SillyTavern
- **Original Tracker**: https://github.com/kaldigo/SillyTavern-Tracker
