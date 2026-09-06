# MUSICAGE SDK 57 Expo Go Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for this plan task-by-task with verification checkpoints. The user previously selected inline, task-by-task execution; independent review is unavailable because the subagent quota is exhausted.

**Goal:** Make the existing personal-use MUSICAGE project open in the current App Store Expo Go on the owner's physical iPhone by aligning it from Expo SDK 54 to SDK 57.

**Architecture:** This remains a managed Expo app with no `ios/` or `android/` native project to regenerate. The migration changes the Expo SDK dependency first, lets the Expo CLI align every Expo/React Native package, then verifies the unchanged recorder, direct-recognition, and lyric UI code with its existing test suite and on the iPhone.

**Tech Stack:** Expo SDK 57, React Native versions selected by `expo install --fix`, TypeScript, Jest Expo, App Store Expo Go on iPhone.

**Spec:** `docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md` (Task 2 updates its previously approved SDK 54 testing constraint to SDK 57).

## Global Constraints

- The physical iPhone has the current App Store Expo Go, which the error screen identifies as SDK 57; the project must use `expo@^57.0.0`.
- Preserve portrait orientation, microphone disclosure, local-only normal visualization, explicit maximum-12-second direct AudD recognition, LRCLIB metadata lookup, SecureStore token storage, and no backend.
- Do not place an AudD token, audio clip, raw provider response, or lyric body in source, Git, output, or documentation.
- The generated `expo-go-qr.png` is an owner convenience artifact and must remain untracked.
- Do not change app behavior to paper over a dependency issue. If a migration exposes a source break, diagnose it before changing source.

---

### Task 1: Align managed Expo dependencies to SDK 57

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if the compiler identifies a concrete SDK 57 incompatibility: the exact source/test file named by the error

**Interfaces:**
- Consumes: the App Store Expo Go SDK 57 requirement from the physical iPhone error and the existing managed Expo configuration.
- Produces: an SDK 57 dependency graph whose recorder, SecureStore, filesystem, and test runtime packages match Expo Go.

- [ ] **Step 1: Stop the old SDK 54 Metro session and preserve the diagnostic baseline**

Run:

```powershell
# In the active Expo terminal, press Ctrl+C.
git status --short
node -p "require('./package.json').dependencies.expo"
```

Expected: the server is stopped, the existing untracked QR image remains the only convenience artifact, and Expo reports `^54.0.37` before migration.

- [ ] **Step 2: Upgrade Expo and align every supported package**

Run exactly:

```powershell
npm install expo@^57.0.0
npx expo install --fix
```

Expected: `package.json` and `package-lock.json` select Expo SDK 57 plus compatible versions of `expo-audio`, `expo-file-system`, `expo-secure-store`, `react`, `react-native`, `jest-expo`, and the app's related Expo packages.

- [ ] **Step 3: Verify the dependency graph and unchanged code**

Run:

```powershell
node -p "require('./package.json').dependencies.expo"
npm test -- --runInBand
npm run typecheck
npx expo-doctor@latest
```

Expected: Expo reports a `^57` range, all existing tests pass, TypeScript has no errors, and Expo Doctor has no incompatible dependency finding.

- [ ] **Step 4: Handle a concrete migration error only if one appears**

If a command in Step 3 reports a source-level failure, first record its exact file, line, and expected-versus-received behavior; then use `superpowers:systematic-debugging` and `superpowers:test-driven-development` to add one failing regression test before changing only that named source file. Re-run the exact failed command plus the full Step 3 command set. Do not upgrade unrelated packages or change product behavior.

- [ ] **Step 5: Commit the dependency alignment**

Run:

```powershell
git add package.json package-lock.json
git commit -m "chore: align musicage with Expo SDK 57"
```

Expected: only the package manifest and lockfile are in this commit unless Step 4 produced a verified source compatibility fix.

### Task 2: Correct the target-SDK documentation and relaunch QR

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md`
- Create/overwrite (untracked): `expo-go-qr.png`

**Interfaces:**
- Consumes: Task 1's verified SDK 57 graph and the existing LAN Expo launch address.
- Produces: truthful owner instructions that match the actual App Store Expo Go, plus a scannable QR for the live server.

- [ ] **Step 1: Find every obsolete SDK 54 owner-facing claim**

Run:

```powershell
rg -n "SDK 54|SDK54|Expo Go" README.md docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md
```

Expected: a small, enumerated set of prior testing assumptions to update; no application code is changed in this task.

- [ ] **Step 2: Replace only the approved target-version claims**

Update the README prerequisite to say App Store Expo Go compatible with Expo SDK 57. Update the design spec's testing/platform constraint from SDK 54 to SDK 57 and record that the physical device mismatch, rather than a product feature decision, required the migration. Preserve all privacy, direct-provider, and no-playback rules verbatim.

- [ ] **Step 3: Start SDK 57 on the LAN and recreate the QR image**

Run:

```powershell
npm run start -- --lan
npx --yes qrcode@1.5.4 --output expo-go-qr.png "exp://192.168.0.8:8081"
```

Expected: Metro advertises the same LAN address, and the PNG contains that address. The iPhone and Windows PC must be on the same Wi-Fi.

- [ ] **Step 4: Commit only permanent documentation**

Run:

```powershell
git add README.md docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md
git commit -m "docs: target Expo Go SDK 57"
```

Expected: `expo-go-qr.png` stays untracked and is not staged.

### Task 3: Validate the new QR in App Store Expo Go

**Files:**
- No permanent product file changes unless a verified physical mismatch requires a fact-only documentation correction.

**Interfaces:**
- Consumes: Task 1's SDK 57 graph and Task 2's live LAN QR.
- Produces: owner-reported physical evidence that the Expo Go mismatch is gone before entering an AudD token.

- [ ] **Step 1: Scan the recreated QR with the physical iPhone**

Use the iPhone Camera or Expo Go to scan `expo-go-qr.png`, then choose Expo Go. Confirm that the previous SDK mismatch page does not appear and that the app opens in portrait.

- [ ] **Step 2: Validate the no-secret local path first**

Allow microphone access, verify a nearby sound changes the visual scene, and verify that no recognition occurs until the explicit `曲を読み取る` press. Do not enter or send a token yet.

- [ ] **Step 3: Record outcome and final repository verification**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npx expo-doctor@latest
git diff --check
git status --short
```

Expected: tests, typecheck, and Doctor pass; the QR remains the only untracked convenience artifact; no secret or recording artifact exists.

## Plan Self-Review

| Requirement | Task coverage |
| --- | --- |
| Match App Store Expo Go SDK 57 | Task 1 dependency upgrade and Task 3 physical scan |
| Preserve existing MUSICAGE behavior | Task 1 full regression suite and global constraints |
| Maintain no-secret/no-backend privacy boundary | Global constraints and Task 3 local-path validation |
| Keep owner documentation accurate | Task 2 |
| Preserve an easy QR workflow | Task 2 LAN launch and untracked QR generation |

The plan has concrete files, exact package/verification commands, a bounded compatibility-fix path, and no unscoped feature work. It supersedes only the old SDK 54 platform assumption; the original personal direct-lyrics architecture remains unchanged.
