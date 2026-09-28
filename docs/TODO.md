# To do

Work we decided on but have not started. Done items move to [PLAN.md](PLAN.md).

## GitHub sign-in through a GitHub App

**Why.** "Sign in with GitHub" (Settings → Backup) is built but hidden, because it needs a client
id that is not set up yet. It asks GitHub for the `repo` scope, which gives Loadout read and write
access to every repository the user owns. A GitHub App can instead be limited to the one backup
repository, with only "Contents: read and write" and "Metadata: read".

**What is there today.** `packages/core/src/backup/github.ts`: device flow against an OAuth App
(`OAUTH_SCOPE = "repo"`), client id from the `githubClientId` setting or the
`LOADOUT_GITHUB_CLIENT_ID` environment variable. Personal access tokens and any Git URL keep working
and are not affected.

**Steps.**

- [ ] Register a GitHub App (not an OAuth App) under the Loadout account: device flow enabled,
      permissions Contents read/write and Metadata read, no webhook, "Any account" can install.
- [ ] Ship its client id in the build (never a client secret or private key).
- [ ] Device flow as today, but without a scope; then check the App is installed and can see
      exactly one repository. If not, open `https://github.com/apps/<slug>/installations/new` and
      offer "Check again".
- [ ] A GitHub App cannot create a repository for the user. Open `https://github.com/new` with the
      name filled in, private ticked, then continue once it exists.
- [ ] User tokens from a GitHub App expire after 8 hours and come with a refresh token (valid 6
      months). Store both in the keychain, refresh before `fetch`/`push`, and ask to sign in again
      when the refresh token is rejected.
- [ ] Git over HTTPS with the user token (`x-access-token`), through the existing `extraHeader`
      path in `credentials.ts`. Check it works for push, fetch and tags.
- [ ] Settings → Backup shows the account, the repository, "Change repository access" (opens the
      App's installation page) and "Disconnect".
- [ ] Update FEATURES.md and PLAN.md, and drop the "needs an OAuth client id" line from Current
      limitations.
