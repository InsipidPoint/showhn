import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "p", "br", "ul", "ol", "li",
  "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel"];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: false,
  });
}
