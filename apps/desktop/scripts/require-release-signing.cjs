// Runs before signing, including when the release config is used outside GitHub Actions.
const REQUIRED = [
  "CSC_NAME",
  "CSC_KEYCHAIN",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") return;
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length)
    throw new Error(`Public macOS signing is not configured: ${missing.join(", ")}`);
};
