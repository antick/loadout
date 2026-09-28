/**
 * Technologies a project can be seen to use, and the words a skill uses for them. A project uses
 * one when it holds one of `files` (a name, or a `*.ext`), or lists one of `packages` as a
 * dependency. A skill is about one when one of `words` is in its name, tags or description, or
 * one of `nameWords` (too common in plain text, like "go") is in its name or tags.
 */
export interface Tech {
  label: string;
  words: readonly string[];
  nameWords?: readonly string[];
  files?: readonly string[];
  packages?: readonly string[];
}

export const TECHS: readonly Tech[] = [
  // Languages
  {
    label: "TypeScript",
    words: ["typescript"],
    nameWords: ["ts"],
    files: ["tsconfig.json", "*.ts", "*.tsx"],
  },
  {
    label: "JavaScript",
    words: ["javascript", "nodejs", "node.js"],
    nameWords: ["js", "node"],
    files: ["package.json"],
  },
  {
    label: "Python",
    words: ["python"],
    nameWords: ["py"],
    files: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "*.py"],
  },
  { label: "Rust", words: ["rust", "cargo"], files: ["Cargo.toml", "*.rs"] },
  { label: "Go", words: ["golang"], nameWords: ["go"], files: ["go.mod", "*.go"] },
  { label: "Ruby", words: ["ruby"], files: ["Gemfile", "*.rb"] },
  {
    label: "Java",
    words: ["java", "maven", "gradle"],
    files: ["pom.xml", "build.gradle", "*.java"],
  },
  { label: "Kotlin", words: ["kotlin"], files: ["build.gradle.kts", "*.kt"] },
  {
    label: "Swift",
    words: ["swift", "swiftui", "xcode"],
    nameWords: ["ios"],
    files: ["Package.swift", "*.swift", "*.xcodeproj"],
  },
  { label: "C#", words: ["c#", "csharp", ".net", "dotnet"], files: ["*.csproj", "*.sln", "*.cs"] },
  { label: "PHP", words: ["php", "laravel"], files: ["composer.json", "*.php"] },
  { label: "Elixir", words: ["elixir", "phoenix"], files: ["mix.exs", "*.ex"] },
  { label: "Dart", words: ["dart", "flutter"], files: ["pubspec.yaml", "*.dart"] },
  { label: "SQL", words: ["sql"], nameWords: ["database", "migrations"], files: ["*.sql"] },
  { label: "Shell", words: ["bash", "zsh"], nameWords: ["shell"], files: ["*.sh"] },
  // Frameworks and libraries
  { label: "React", words: ["react", "jsx"], packages: ["react"] },
  {
    label: "Next.js",
    words: ["next.js", "nextjs"],
    packages: ["next"],
    files: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  { label: "Vue", words: ["vue", "vue.js", "nuxt"], packages: ["vue", "nuxt"] },
  { label: "Svelte", words: ["svelte", "sveltekit"], packages: ["svelte"] },
  { label: "Angular", words: ["angular"], packages: ["@angular/core"] },
  { label: "React Native", words: ["react-native", "expo"], packages: ["react-native", "expo"] },
  { label: "Electron", words: ["electron"], packages: ["electron"] },
  { label: "Tailwind CSS", words: ["tailwind", "tailwindcss"], packages: ["tailwindcss"] },
  { label: "shadcn/ui", words: ["shadcn", "shadcn/ui"], files: ["components.json"] },
  {
    label: "Express",
    words: ["express.js", "expressjs"],
    nameWords: ["express"],
    packages: ["express"],
  },
  { label: "Django", words: ["django"], packages: ["django"] },
  { label: "Flask", words: ["flask"], packages: ["flask"] },
  { label: "FastAPI", words: ["fastapi"], packages: ["fastapi"] },
  { label: "Rails", words: ["rails", "ruby on rails"], packages: ["rails"] },
  { label: "GraphQL", words: ["graphql"], packages: ["graphql"], files: ["*.graphql"] },
  {
    label: "Prisma",
    words: ["prisma"],
    packages: ["prisma", "@prisma/client"],
    files: ["schema.prisma"],
  },
  { label: "Drizzle", words: ["drizzle"], packages: ["drizzle-orm"] },
  {
    label: "PostgreSQL",
    words: ["postgres", "postgresql", "psql"],
    packages: ["pg", "postgres", "psycopg2", "psycopg"],
  },
  {
    label: "MongoDB",
    words: ["mongodb", "mongo", "mongoose"],
    packages: ["mongodb", "mongoose", "pymongo"],
  },
  { label: "Redis", words: ["redis"], packages: ["redis", "ioredis"] },
  {
    label: "Supabase",
    words: ["supabase"],
    packages: ["@supabase/supabase-js"],
    files: ["supabase"],
  },
  {
    label: "Firebase",
    words: ["firebase"],
    packages: ["firebase", "firebase-admin"],
    files: ["firebase.json"],
  },
  { label: "Stripe", words: ["stripe"], packages: ["stripe"] },
  // Testing
  {
    label: "Playwright",
    words: ["playwright"],
    packages: ["@playwright/test", "playwright"],
    files: ["playwright.config.ts", "playwright.config.js"],
  },
  { label: "Cypress", words: ["cypress"], packages: ["cypress"] },
  { label: "Jest", words: ["jest"], packages: ["jest"] },
  { label: "Vitest", words: ["vitest"], packages: ["vitest"] },
  { label: "pytest", words: ["pytest"], packages: ["pytest"] },
  // Build, deploy and infrastructure
  {
    label: "Docker",
    words: ["docker", "dockerfile"],
    files: ["Dockerfile", "docker-compose.yml", "compose.yaml"],
  },
  { label: "Kubernetes", words: ["kubernetes", "k8s", "helm"], files: ["Chart.yaml"] },
  { label: "Terraform", words: ["terraform"], files: ["*.tf"] },
  {
    label: "GitHub Actions",
    words: ["github actions"],
    nameWords: ["ci", "gh-actions"],
    files: [".github/workflows"],
  },
  { label: "Vercel", words: ["vercel"], files: ["vercel.json"] },
  {
    label: "Cloudflare",
    words: ["cloudflare", "wrangler"],
    files: ["wrangler.toml", "wrangler.json", "wrangler.jsonc"],
  },
  {
    label: "AWS",
    words: ["aws"],
    nameWords: ["lambda", "s3"],
    packages: ["aws-sdk", "@aws-sdk/client-s3", "boto3"],
  },
  {
    label: "OpenAPI",
    words: ["openapi", "swagger"],
    files: ["openapi.json", "openapi.yaml", "swagger.json"],
  },
  // Docs and writing
  {
    label: "Docs",
    words: ["mkdocs"],
    nameWords: ["docs", "documentation", "readme"],
    files: ["docs", "mkdocs.yml"],
  },
];
