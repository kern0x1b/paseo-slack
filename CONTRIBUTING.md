# Contributing

Thanks for your interest in improving `paseo-slack`.

## Development Setup

```bash
# Run tests offline
npm test

# Link CLI locally
npm link
```

## Before Opening a Pull Request

- `npm test` passes completely.
- Any new feature or bug fix includes corresponding tests in `test/`.
- Tests must never touch the live network — mock at the `fetch` or `WebSocket` boundary.
- Code remains comment-free and self-documenting.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Conventions and Invariants

See [AGENTS.md](AGENTS.md) for architectural details, directory layout, and security invariants (zero external runtime dependencies, tokens stored locally in user config, deterministic inbound event routing).

## Reporting Issues

Open an issue on GitHub with steps to reproduce, expected behavior, and observed behavior. Never include real tokens, cookies, or confidential team conversation logs.
