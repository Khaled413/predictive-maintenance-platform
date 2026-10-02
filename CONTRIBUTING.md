# Contributing to Predictive Maintenance Platform

Thank you for contributing.

## Development setup

```bash
git clone https://github.com/Khaled413/predictive-maintenance-platform.git
cd predictive-maintenance-platform
npm install
npm run setup:ml
npm run dev
```

## Branching

Use descriptive branch names:

- `feature/...`
- `fix/...`
- `docs/...`
- `chore/...`

## Coding standards

### Frontend

- Use TypeScript when editing frontend files.
- Prefer small, readable components.
- Keep imports consistent and avoid unused variables.
- Run checks before pushing:

```bash
npm run lint
npm run typecheck
npm run build
```

### Python

- Keep functions focused and typed where practical.
- Use Black and isort formatting.
- Add or update tests for model/API behavior changes.

## Testing

```bash
npm run smoke
npm run typecheck
python -m unittest discover -s ml/tests -v
```

## Pull request checklist

- Clear title and description
- Explain the problem and the fix
- Include relevant tests
- Keep the PR focused on one concern
- Ensure lint and build checks pass

## Commit convention

Use conventional commits when possible:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` refactor
- `test:` tests
- `chore:` tooling or repo maintenance

Thanks for helping improve the project.
