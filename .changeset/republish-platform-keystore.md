---
"@noem/platform-keystore": patch
---

Republish: 0.0.2 shipped with unresolved `link:` optionalDependencies and no native subpackages on npm. Release workflow's matrix detector (`scripts/release-matrix.mts`) used `git show HEAD` which returns empty for merge commits (combined-diff default), so `nativeChanged="false"` skipped `napi pre-publish`. Detector now uses `git diff HEAD~1 HEAD`.
