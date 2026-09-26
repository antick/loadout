import { ImageOff } from "lucide-react";
import { type ComponentProps, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { HighlightedCode } from "@/components/HighlightedCode";
import { useOpenExternal } from "@/hooks/mutations/app";
import { parseFrontmatter } from "@/lib/frontmatter";
import { cn } from "@/lib/utils";

const EXTERNAL_LINK_PATTERN = /^https?:\/\//i;
const FENCE_LANGUAGE_PATTERN = /(?:^|\s)language-(\S+)/;
const TRAILING_NEWLINE_PATTERN = /\n$/;

/** Links never navigate the app window: web links open in the browser, the rest do nothing. */
function MarkdownLink({ href, children, ...props }: ComponentProps<"a">): ReactNode {
  const openExternal = useOpenExternal();
  return (
    <a
      {...props}
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      onClick={(event) => {
        event.preventDefault();
        if (href && EXTERNAL_LINK_PATTERN.test(href)) openExternal.mutate(href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * An image from the web is never fetched: a skill's author could track who opens the document.
 * It shows as a link to open in the browser instead; images embedded as data stay inline.
 */
function MarkdownImage({ src, alt, ...props }: ComponentProps<"img">): ReactNode {
  const { t } = useTranslation();
  const source = typeof src === "string" ? src : "";
  if (!EXTERNAL_LINK_PATTERN.test(source)) {
    return <img alt={alt ?? ""} src={source} className="my-3 max-w-full rounded-md" {...props} />;
  }
  return (
    <MarkdownLink href={source} title={source}>
      <ImageOff className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
      {alt ? t("markdown.remoteImageNamed", { alt }) : t("markdown.remoteImage")}
    </MarkdownLink>
  );
}

/** Tailwind-only styling for every Markdown element we render (no typography plugin). */
const BASE_COMPONENTS: Components = {
  h1: ({ node: _node, children, ...props }) => (
    <h1 className="mt-6 mb-3 text-xl font-semibold tracking-tight first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h2
      className="mt-6 mb-2 border-b pb-1 text-lg font-semibold tracking-tight first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h3 className="mt-5 mb-2 text-base font-semibold first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <h4 className="mt-4 mb-1 text-sm font-semibold first:mt-0" {...props}>
      {children}
    </h4>
  ),
  p: ({ node: _node, ...props }) => (
    <p className="my-3 leading-6 first:mt-0 last:mb-0" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 marker:text-muted-foreground" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="leading-6 [&>ul]:my-1 [&>ol]:my-1" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-3 border-l-2 border-primary/50 pl-3 text-muted-foreground"
      {...props}
    />
  ),
  hr: ({ node: _node, ...props }) => <hr className="my-5 border-border" {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold" {...props} />,
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-5 [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    // Fenced blocks carry their language as `language-<name>`; inline code carries none.
    const language = FENCE_LANGUAGE_PATTERN.exec(className ?? "")?.[1];
    if (language) {
      return (
        <HighlightedCode
          code={String(children).replace(TRAILING_NEWLINE_PATTERN, "")}
          language={language}
          className={className}
        />
      );
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border-b bg-muted/50 px-3 py-1.5 text-left font-medium" {...props} />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b px-3 py-1.5 align-top last:border-b-0" {...props} />
  ),
  img: ({ node: _node, ...props }) => <MarkdownImage {...props} />,
  a: ({ node: _node, ...props }) => <MarkdownLink {...props} />,
  input: ({ node: _node, ...props }) => (
    <input className="mr-1.5 align-middle accent-primary" {...props} />
  ),
};

export interface MarkdownViewProps {
  content: string;
  /** Show the YAML frontmatter as a small table above the body (default true). */
  showFrontmatter?: boolean;
  className?: string;
}

/** Sanitised GitHub-flavoured Markdown. Frontmatter becomes a metadata table; links open outside. */
export function MarkdownView({
  content,
  showFrontmatter = true,
  className,
}: MarkdownViewProps): ReactNode {
  const { entries, body } = useMemo(() => parseFrontmatter(content), [content]);

  return (
    <div className={cn("markdown-body text-sm break-words", className)}>
      {showFrontmatter && entries.length > 0 ? (
        <dl className="mb-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          {entries.map((entry) => (
            <div key={entry.key} className="contents">
              <dt className="font-mono text-muted-foreground">{entry.key}</dt>
              <dd className="min-w-0">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={BASE_COMPONENTS}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
