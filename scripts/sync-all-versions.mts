#!/usr/bin/env node

// Runs all the sync jobs during the version command
// These jobs should be built as side-effects (loading the file executes the code)
// These jobs should be fully synchronous

import './sync-cargo-package.mts';
import './sync-napi-subpackages.mts';
import './sync-cargo-lock.mts';
import './sync-licenses.mts';
