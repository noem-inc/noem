## Supply Chain Security

This project enforces strict supply-chain security standards to prevent malicious package injections:

- **Zero Long-Lived Tokens:** We use **Trusted Publishing** via OpenID Connect (OIDC) to authenticate releases dynamically with npm. No passwords or static API keys are stored in our CI environment.
- **Mandatory 2FA:** Package publishing settings strictly enforce "Require two-factor authentication and disallow tokens" for all maintainer accounts.
- **Cryptographic Build Provenance:** All releases are cryptographically signed and tied back to the exact GitHub Actions run that compiled them.
