# TODO

## Secrets hardening

Remaining manual steps to scope deploy and signing secrets to the GitHub environment that uses them and rotate tokens. Current deploys keep working until the repo-level copies are deleted, so do the delete step last.

- [ ] Add `UPDATE_FEED_SIGNING_KEY` to the `release` environment (Settings > Environments > release > Environment secrets > Add environment secret). The `release` job in `release.yml` uses it and runs in `release` (`v*` tags only). Use the current private key value; rotating it would also need the matching public key shipped in the app.
- [ ] Create a new Vercel token for `loadout` only: Vercel Account Settings > Tokens > Create, scope it to the team that owns the project, and set an expiration date. Store it as `VERCEL_TOKEN` in the `Production` environment (Settings > Environments > Production > Environment secrets > Add environment secret).
- [ ] Copy `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` into the `Production` environment as environment secrets (the workflow reads them from `secrets.*`, so they cannot be variables). These are not sensitive: the Team ID is under Vercel Team Settings > General and each Project ID is under the Vercel project > Settings > General.
- [ ] Verify: run Actions > Vercel production > Run workflow on `main`. It redeploys the latest stable release. The deploy job runs in `Production` and should finish green with the new token.
- [ ] Verify the update feed signing on the next `v*` tag: the `release` job should sign the feed and finish green.
- [ ] After the verification run passes, delete the repo-level copies of `UPDATE_FEED_SIGNING_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` under Settings > Secrets and variables > Actions > Repository secrets.
- [ ] Revoke the old Vercel token in Account Settings > Tokens once nothing else uses it.
- [ ] Optional, when the Homebrew tap is set up: `publish-homebrew.yml` reads `HOMEBREW_TAP_TOKEN`, which does not exist yet. Create a fine-grained GitHub token limited to `antick/homebrew-tap` with Contents read and write only and an expiry. Its job has no environment, so either add one or store it as a repository secret.
