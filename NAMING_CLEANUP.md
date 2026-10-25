# Naming Inconsistencies Cleanup

**Date:** 2026-10-19
**Purpose:** Document cleanup of naming inconsistencies identified in gap analysis

---

## Changes Made

### 1. README.md Updates

**Change:** Updated the "Project Files & Commands" section to clarify legacy artifacts

**Before:**
```
- `LocalCore.bat` and the included `.exe` files are existing launch/installer artifacts; they are not rebuilt to package the downloaded model/runtime.
```

**After:**
```
- `LocalCore.bat` and the included `.exe` files are legacy launch/installer artifacts from an earlier version; they are not rebuilt for the current model setup and should be removed or regenerated.
```

**Also added note about demo generators:**
```
- `pipelines/image_pipeline.js`, `pipelines/music_pipeline.js`, and `pipelines/video_pipeline.js` create procedural demo PNG, WAV, and GIF files in `output/`. These are placeholder implementations and will be replaced with permissioned desktop tools in Phase 5.
```

### 2. config/local-ai.config.json Updates

**Change:** Added note to activeModel about future parameterization

**Added field:**
```json
"note": "Current implementation. Will be parameterized as floor.model after Phase 0 S0.4 spike determines optimal model (target: Qwen2.5-3B-Instruct Q4_K_M or Qwen2.5-1.5B-Instruct Q4_K_M per Phase 1 §0.1)"
```

**Rationale:** Documents that the current Dolphin model is a placeholder and will be replaced with the parameterized `floor.model` after the S0.4 feasibility spike.

### 3. Blueprint Files Cleanup

**Problem:** Blueprint folder had duplicate files with Windows-incompatible filenames (spaces, special characters, parentheses).

**Action:** Cleaned up to use only canonical filenames from the master index.

**Files removed (superseded drafts):**
- `LocalCore — Phase 0 Technical Spec.md` (superseded by v1.1)
- `LocalCore — Phase 1 Technical Spec_ Character & Chat.md` (superseded by v1.3)
- `LocalCore — Phase 2 Technical Spec_ Memory.md` (superseded by v1.1)
- `LocalCore — Phase 3 Technical Spec_ Voice.md` (superseded by v1.1)
- `LocalCore — Phase 5 Technical Spec_ Desktop Tools with Permissions.md` (superseded by v1.1)
- `localcore-phase5-spec-final.md` (archive stub)
- `LocalCore — Phase 1 Technical Spec v1.1 (final)_ Character & Chat` (superseded by v1.3)

**Files retained (canonical versions):**
- `localcore-blueprint-v1.md` - Product Blueprint
- `localcore-phase0-spec-v11.md` - Phase 0 Technical Spec
- `localcore-phase1-spec-v13.md` - Phase 1 Technical Spec
- `localcore-phase2-spec-v11.md` - Phase 2 Technical Spec
- `localcore-phase3-spec-v11.md` - Phase 3 Technical Spec
- `localcore-phase4-spec-v11.md` - Phase 4 Technical Spec
- `localcore-phase5-spec-v11.md` - Phase 5 Technical Spec
- `localcore-phase6-spec-v11.md` - Phase 6 Technical Spec
- `localcore-master-index.md` - Master index
- `localcore-build-order.md` - Build order
- All task list files (s01-s63)
- Supporting documents (consistency-fixes, inventory, release-checklist)

---

## Remaining Items (Deferred)

### Project Folder Name

**Current:** `localcore-offline-windows-deepseek-r1-1.5b-v2.1.0`

**Should be:** `localcore-offline-desktop` (to match package.json)

**Status:** **DEFERRED** - Renaming the folder would require updating all relative paths, git history, and potentially breaking build scripts. This is a low-priority cosmetic issue that can be addressed later if needed.

**Recommended action:** Document the discrepancy and proceed with implementation. The folder name does not affect functionality.

### Legacy Executable Files

**Files:**
- `LocalCore.bat`
- `LocalCore AI.exe`
- `LocalCore-AI-Setup-1.2.0.exe`
- `LocalCore.vbs`
- `LocalCore.exe`

**Status:** **DEFERRED** - These are legacy artifacts from an earlier version. They are not used by the current npm-based development workflow.

**Recommended action:** Remove them when implementing Phase 5 installer (S5.4) or when creating a new distribution build. They are not blocking current development.

---

## Summary

✅ **Completed:**
- Updated README to clarify legacy artifacts and demo generators
- Added documentation note to config about model parameterization
- Cleaned up blueprint files to use only canonical filenames
- Removed superseded draft specifications

⏸️ **Deferred (low priority):**
- Project folder rename (cosmetic, high effort)
- Legacy exe/bat file removal (will be handled in Phase 5)

---

## Impact

The naming cleanup ensures:
1. Documentation accurately reflects current state
2. Blueprint files are consistent and use cross-platform compatible filenames
3. Future developers won't be confused by duplicate or outdated specification files
4. The path is clear for Phase 0 implementation

No functional changes were made to the application code.
