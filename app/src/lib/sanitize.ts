import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "p", "br", "ul", "ol", "li",
  "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel"];

/**
 * HN wraps indented text in <pre><code>...</code></pre> even when it's
 * regular prose, not actual code. This converts those blocks to <p> tags.
 */
function unwrapHnCodeBlocks(html: string): string {
  return html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_match, inner: string) => {
    // Decode HTML entities for processing
    const text = inner
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    // Split on double-newlines (paragraph breaks) and strip leading whitespace
    const paragraphs = text
      .split(/\n\n+/)
      .map((p: string) => p.replace(/^ {2,}/gm, "").trim())
      .filter((p: string) => p.length > 0);

    // Re-encode < and > for safety, keep quotes/slashes as-is
    return paragraphs
      .map((p: string) => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
      .join("");
  });
}

export function sanitizeHtml(dirty: string): string {
  const unwrapped = unwrapHnCodeBlocks(dirty);
  return DOMPurify.sanitize(unwrapped, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: false,
  });
}
