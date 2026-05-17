# Contributing to windsurf-assistant

Thank you for considering contributing to this project! This guide
describes how to report issues, propose features, and submit pull
requests.

## Reporting Issues

Please use [GitHub Issues](../../issues) for:

- **Bug reports** — please include:
  - Reproduction steps
  - Expected vs actual behaviour
  - Environment details (OS, Windsurf IDE version, Node.js version)
  - Relevant logs (with sensitive information redacted)
- **Feature requests** — please describe:
  - The use case and motivation
  - Proposed solution (if any)
  - Alternatives considered

For **security vulnerabilities**, please follow
[SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes with clear, descriptive commits
4. Ensure all tests pass:

   ```bash
   node tests/run_all.cjs
   ```

5. Open a pull request against `main` with:
   - A clear title and description
   - Reference to any related issue (`Fixes #123`)
   - A summary of changes and reasoning

## Code Style

- **JavaScript / Node.js**: 2-space indentation, single quotes,
  semicolons; follow existing patterns in the codebase as a guide
- **Markdown**: 80-column soft wrap where reasonable
- **Avoid** introducing new external dependencies without discussion in
  an issue first

## Testing

All new functionality should include tests in the `tests/` directory.
Run the full suite before submitting:

```bash
node tests/run_all.cjs
```

The CI workflow (`.github/workflows/test-core.yml`) will run the same
suite on every pull request. PRs that fail CI will not be merged until
fixed.

## Commit Messages

Use clear, descriptive commit messages.
[Conventional Commits](https://www.conventionalcommits.org/) style is
encouraged but not required:

```
type: short description

Longer explanation if needed (wrap at ~72 chars).
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
`build`, `ci`.

## Code of Conduct

All contributors are expected to follow our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed
under the same [MIT License](./LICENSE) that covers the project.

---

*帛书六十四「合抱之木 · 生于毫末 · 九成之台 · 作于累土 · 百仞之高 · 始于足下」*
*The mighty tree springs from a tiny shoot; the nine-storey tower rises
from a heap of earth; the journey of a thousand miles begins beneath
one's feet.*
