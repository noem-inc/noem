# @noem/platform-keystore

## 0.0.11

### Patch Changes

- 5308812: Fix error code handling and add darwin x64 support

## 0.0.10

### Patch Changes

- ed20705: Fix missing dist and license files

## 0.0.9

### Patch Changes

- b70a6f8: Implement IOS Enclave Keystore

## 0.0.8

### Patch Changes

- be57556: Update the License

## 0.0.7

### Patch Changes

- 11ba22f: Trigger redeployment test

## 0.0.6

### Patch Changes

- e59934b: Retrigger to clean build

## 0.0.5

### Patch Changes

- eb38288: Full e2e release test

## 0.0.4

### Patch Changes

- 721c384: Trigger re-publish

## 0.0.3

### Patch Changes

- 4999c63: Republish: 0.0.2 shipped with unresolved `link:` optionalDependencies and no native sub-packages on npm. Release workflow's matrix detector (`scripts/release-matrix.mts`) used `git show HEAD` which returns empty for merge commits (combined-diff default), so `nativeChanged="false"` skipped `napi pre-publish`. Detector now uses `git diff HEAD~1 HEAD`.

## 0.0.2

### Patch Changes

- ef33fa8: Test release process

## 0.0.1

### Patch Changes

- 10e8f70: Initial multi-platform npm release. Native binary for Windows (x64 + arm64)
  and macOS (arm64) now ships in per-platform optionalDependencies
  sub-packages so npm fetches only the matching binary per host.

## 0.0.0
