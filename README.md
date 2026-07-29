[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# moon - CI run reports

A GitHub Action that publishes the results of a [`moon ci`](https://moonrepo.dev/docs/commands/ci) run as a pull request comment and workflow summary. The report renders all actions, their final status, and time to completion in a markdown table.

## Usage

The action must run **after** the `moon ci` command.

```yaml
jobs:
  ci:
    name: CI
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: moon ci
      - uses: step-security/run-report-action@v1
        if: success() || failure()
        with:
          access-token: ${{ secrets.GITHUB_TOKEN }}
```

### Matrix builds

Pass the full matrix object so parallel builds post separate comments instead of overwriting each other.

```yaml
jobs:
  ci:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v7
      - run: moon ci
      - uses: step-security/run-report-action@v1
        if: success() || failure()
        with:
          access-token: ${{ secrets.GITHUB_TOKEN }}
          matrix: ${{ toJSON(matrix) }}
```

## Inputs

| Name | Type | Required | Default | Description |
| ---- | ---- | :------: | ------- | ----------- |
| `access-token` | string | ✓ | — | GitHub token used to post run report comments on pull requests. |
| `limit` | number | | `20` | Maximum number of actions to show in the report table before overflow. |
| `matrix` | string | | `""` | Job matrix data as a JSON string, used to distinguish parallel builds. |
| `skip-comment` | boolean | | `false` | Set to true to skip PR comment creation. Pairs well with the `report` output. |
| `slow-threshold` | number | | `120` | Duration in seconds beyond which an action is marked as slow. |
| `sort-by` | string | | `""` | Column to sort the actions table by. Accepts `time` or `label`. |
| `sort-dir` | string | | `desc` | Sort direction for the actions table. Accepts `asc` or `desc`. |
| `workspace-root` | string | | `""` | Absolute path to the moon workspace root. Defaults to the working directory. |

## Outputs

| Name | Type | Description |
| ---- | ---- | ----------- |
| `comment-created` | boolean | Set to `true` if a comment was successfully posted to the pull request. |
| `report` | string | The full run report formatted as a markdown string. |
