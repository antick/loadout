/**
 * Schema migrations, applied in order. `PRAGMA user_version` holds the number applied so far.
 * Never edit a shipped migration; append a new one.
 * All timestamps are epoch milliseconds; ids are UUID strings.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL,
    source_ref TEXT,
    source_url TEXT,
    source_subpath TEXT,
    source_branch TEXT,
    source_revision TEXT,
    remote_revision TEXT,
    library_path TEXT NOT NULL UNIQUE,
    content_hash TEXT,
    update_status TEXT NOT NULL DEFAULT 'unknown',
    last_checked_at INTEGER,
    last_check_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_skills_name ON skills(name);

  -- One deployed copy or symlink of a skill in an agent's global folder.
  -- target_path is deliberately not unique: several agents can share one folder.
  CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent_key TEXT NOT NULL,
    target_path TEXT NOT NULL,
    mode TEXT NOT NULL,
    source_hash TEXT,
    synced_at INTEGER,
    UNIQUE(skill_id, agent_key)
  );
  CREATE INDEX idx_deployments_path ON deployments(target_path);

  CREATE TABLE skill_tags (
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (skill_id, tag)
  );
  CREATE INDEX idx_skill_tags_tag ON skill_tags(tag);

  CREATE TABLE presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 999,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE preset_skills (
    preset_id TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 999,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (preset_id, skill_id)
  );

  -- Per-skill per-agent switch inside a preset. A missing row means "on".
  CREATE TABLE preset_skill_agents (
    preset_id TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (preset_id, skill_id, agent_key)
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'project',
    linked_agent_key TEXT,
    disabled_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    detail TEXT,
    ok INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_activity_at ON activity(at);

  CREATE TABLE market_cache (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Skills a backup sync found changed on two devices. Local copy stays until the user chooses.
  CREATE TABLE backup_conflicts (
    skill_key TEXT PRIMARY KEY,
    skill_name TEXT NOT NULL,
    theirs_commit TEXT NOT NULL,
    theirs_path TEXT,
    detected_at INTEGER NOT NULL
  );
  `,
  `
  -- Files edited in the app since the skill last came from its source: a JSON array of paths.
  ALTER TABLE skills ADD COLUMN edited_files TEXT;
  `,
  `
  -- What the skill held right after it last came from its source: the content hash, and a JSON
  -- object of file path to SHA-256. A later difference is an edit, made in the app or not.
  ALTER TABLE skills ADD COLUMN installed_hash TEXT;
  ALTER TABLE skills ADD COLUMN installed_files TEXT;
  `,
  `
  -- The user said they wrote the skill themselves, so no source is looked for: 1, else 0.
  ALTER TABLE skills ADD COLUMN authored INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Subagents, commands and rules written into an agent's folder (project_id '' = the agent's
  -- global folder). written_hash: SHA-256 of the file as written, so an edit made there is seen
  -- and never overwritten; source_hash: the library item it was converted from.
  CREATE TABLE item_deployments (
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    agent_key TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    target_path TEXT NOT NULL,
    written_hash TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (kind, name, agent_key, project_id)
  );
  CREATE INDEX idx_item_deployments_path ON item_deployments(target_path);
  `,
  `
  -- Skill runs read from agents' session logs on this computer (usage/). event_id is unique
  -- per agent, so reading a log again never counts a run twice. name is as the agent wrote it.
  CREATE TABLE usage_events (
    agent_key TEXT NOT NULL,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    used_at INTEGER NOT NULL,
    project_path TEXT,
    PRIMARY KEY (agent_key, event_id)
  );
  CREATE INDEX idx_usage_events_name ON usage_events(name);

  -- How far each session log was read: read_to is the byte offset after the last whole line.
  -- project_path: the folder the log's session ran in, when the log names it once at the top.
  CREATE TABLE usage_files (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    read_to INTEGER NOT NULL,
    project_path TEXT
  );
  `,
  `
  -- File patterns of projects the skill is suggested for: a JSON array, NULL when none.
  ALTER TABLE skills ADD COLUMN suggest_for TEXT;
  `,
  `
  -- Keys of agents the skill must never be deployed to: a JSON array, NULL when none.
  ALTER TABLE skills ADD COLUMN blocked_agents TEXT;
  `,
  `
  -- The user's own note on the skill, NULL when none.
  ALTER TABLE skills ADD COLUMN note TEXT;
  `,
  `
  -- When the user made the skill a favourite (epoch ms), NULL when it is not one.
  ALTER TABLE skills ADD COLUMN favorited_at INTEGER;
  `,
  `
  -- Another site a link's download moved to that the user agreed to at install, NULL when none.
  ALTER TABLE skills ADD COLUMN source_trusted_host TEXT;
  `,
  `
  -- Subagents, commands and rules are no longer managed: their files stay where they are.
  DROP TABLE IF EXISTS item_deployments;
  `,
  `
  -- Merging is always per skill now: the switch that turned it off is gone.
  DELETE FROM settings WHERE key = 'skillAwareMerge';
  `,
  `
  -- The UI ships in English only: the language picker is gone.
  DELETE FROM settings WHERE key = 'language';
  `,
  `
  -- The GitHub sign-in client id comes only from the build's environment now.
  DELETE FROM settings WHERE key = 'githubClientId';
  `,
  `
  -- Update checks count as fresh for a fixed hour: the setting for it is gone.
  DELETE FROM settings WHERE key = 'updateCheckTtlMinutes';
  `,
  `
  -- Runtime state moves out of the user settings into core's own keys; the answers are kept.
  UPDATE settings SET key = 'updates.lastRunAt' WHERE key = 'autoUpdateLastRunAt' AND value <> '0';
  UPDATE settings SET key = 'backup.lastAutoError' WHERE key = 'backupLastAutoError' AND value <> '""';
  UPDATE settings SET key = 'backup.firstRunAnswered', value = 'true'
    WHERE key = 'backupFirstRunPrompt' AND value <> '""';
  UPDATE settings SET key = 'system.agentControlDismissed', value = 'true'
    WHERE key = 'agentControlPrompt' AND value = '"dismissed"';
  DELETE FROM settings
    WHERE key IN ('autoUpdateLastRunAt', 'backupLastAutoError', 'backupFirstRunPrompt', 'agentControlPrompt');
  `,
  `
  -- When a re-index first found the skill's folder missing (epoch ms), NULL while it is there.
  -- The row is only dropped once the folder has stayed away for a grace period.
  ALTER TABLE skills ADD COLUMN missing_since INTEGER;
  `,
];
