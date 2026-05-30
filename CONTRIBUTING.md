# Contributing to noem

Thanks for your interest in contributing! This guide covers the essentials.

## Code of Conduct

This project follows its [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Getting Started

This is a pnpm + Cargo monorepo.

```bash
pnpm install
pnpm test
```

## Making Changes

1. Fork the repo and create a feature branch off `main`.
2. Make your change. Keep it focused.
3. Add or update tests — all code changes must be tested.
4. Add a changeset for any user-facing change: `pnpm changeset`.
5. Run the test suite and ensure it passes before opening a PR.

## Pull Requests

- Target the `main` branch.
- Write a clear description of what and why.
- Keep PRs small and reviewable.
- All checks (tests, lint, spellcheck) must pass.

## Reporting Bugs & Vulnerabilities

- **Bugs:** open a GitHub issue with steps to reproduce.
- **Security vulnerabilities:** do not open a public issue. See [SECURITY.md](./SECURITY.md) for private disclosure.

## License

This project is dual-licensed under [MIT](./LICENSE-MIT) and [Apache 2.0](./LICENSE-APACHE). By contributing, you agree your contributions are licensed under the same terms.
