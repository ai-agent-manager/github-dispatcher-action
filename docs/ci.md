# CI validation

The repo includes `.github/workflows/ci.yml`, which runs on every push and pull request and executes `npm run validate`.

That validation command runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run lint`
