# deploy

## Purpose

Deploying library skills into agent skills folders by symlink or copy, enforcing ownership rules so Loadout never deletes unrelated paths, and batch apply or remove across agents.

## Requirements

### Requirement: Deploy and undeploy

The deploy engine SHALL create a deployment row and place a symlink or copy of the library skill into the target agent's skills directory when `deploy` is called, and SHALL refuse deployment when the skill is blocked for that agent.

#### Scenario: Blocked skill deploy attempt

- **WHEN** `deploy` is called for a skill blocked for the agent
- **THEN** the API returns `INVALID_INPUT` and changes no files

### Requirement: Ownership-safe undeploy

When undeploying, the engine SHALL remove only paths Loadout created for that deployment, and SHALL move edited copies to Recently removed instead of deleting them silently.

#### Scenario: Undeploy edited copy

- **WHEN** the user undeploys a skill whose agent copy was edited locally
- **THEN** the result names the Recently removed entry so the UI can offer undo

### Requirement: Batch apply

`DeployApi.apply` SHALL add or remove many skill and agent pairs, honouring dry run, skip conflicts, and reporting counts of applied and skipped pairs.

#### Scenario: Dry run batch remove

- **WHEN** `apply` runs with action `remove` and `dryRun: true`
- **THEN** no filesystem changes occur and the result reports the same counts as a real run would

### Requirement: Cross-process library lock

Filesystem writes that touch the library SHALL run inside `ctx.lock.run` and SHALL NOT hold the lock across network calls.

#### Scenario: Concurrent install and deploy

- **WHEN** two operations acquire the library lock in sequence
- **THEN** each operation completes atomically relative to library metadata updates
