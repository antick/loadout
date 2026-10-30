# install

## Purpose

Installing skills into the library from local folders, archives, download links, Git repositories, and marketplace providers, including preview flows, safety gating, and local machine scan import.

## Requirements

### Requirement: Local and archive install

`InstallApi.fromPath` SHALL accept a folder or archive path, and multi-skill archives SHALL be listed through `previewArchive` before confirmation.

#### Scenario: User previews a zip with multiple skills

- **WHEN** `previewArchive` runs on a multi-skill archive
- **THEN** the preview lists selectable skill entries without writing to the library

### Requirement: Git preview and confirm

The install service SHALL fetch Git sources or archive links, expose `previewGit`, and install selected entries through `confirmGit`, refusing redirects without `acceptRedirect` and unsafe skills without `acceptRisk`.

#### Scenario: Redirect without acceptance

- **WHEN** a preview download redirects and `acceptRedirect` is unset
- **THEN** `confirmGit` refuses and leaves the preview open

### Requirement: Marketplace install

`MarketApi` SHALL serve board rankings and search results with offline cache timestamps, and `InstallApi.fromMarket` or `fromClawhub` SHALL install a chosen listing into the library with progress keys for cancellation.

#### Scenario: Offline marketplace board

- **WHEN** the network is unavailable
- **THEN** `board` returns the last cached listing and includes `cachedAt`

### Requirement: Local scan import

`InstallApi.scanLocal` SHALL discover skills already present in agent folders, and `importDiscovered` or `importAllDiscovered` SHALL copy them into the library when requested.

#### Scenario: Import one discovered skill

- **WHEN** `importDiscovered` succeeds
- **THEN** a new library skill exists with metadata derived from the discovered folder
