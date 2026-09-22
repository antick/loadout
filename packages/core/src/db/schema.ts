/**
 * Schema migrations, applied in order. `PRAGMA user_version` holds the number applied so far.
 * Never edit a shipped migration — append a new one.
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
];
