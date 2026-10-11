import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

export const TIPTAP_LIMITS = { bytes: 65536, depth: 20, nodes: 2000 } as const;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: JsonObject, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const blocks = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
];
const inline = ["text"];
const marks = ["bold", "italic", "link"];
export function validPostgresText(value: string) {
  return (
    !value.includes("\u0000") &&
    !Array.from(value).some(
      (character) =>
        character.length === 1 &&
        character.charCodeAt(0) >= 0xd800 &&
        character.charCodeAt(0) <= 0xdfff,
    )
  );
}
function safeLink(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !validPostgresText(value) ||
    !/^https?:\/\//i.test(value) ||
    /\s/u.test(value) ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Explicit schema for persisted JSON, not an HTML sanitizer. Text stays text.
export function validTipTap(value: unknown): boolean {
  try {
    if (!object(value) || value.type !== "doc") return false;
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, "utf8") > TIPTAP_LIMITS.bytes) return false;
    let count = 0;
    function node(value: unknown, depth: number, parent?: string): boolean {
      if (
        ++count > TIPTAP_LIMITS.nodes ||
        depth > TIPTAP_LIMITS.depth ||
        !object(value) ||
        typeof value.type !== "string"
      )
        return false;
      const type = value.type;
      if (
        parent === undefined
          ? type !== "doc"
          : parent === "doc" || parent === "blockquote" || parent === "listItem"
            ? !blocks.includes(type)
            : parent === "bulletList" || parent === "orderedList"
              ? type !== "listItem"
              : !inline.includes(type)
      )
        return false;
      if (
        !keys(
          value,
          type === "text"
            ? ["type", "text", "marks"]
            : ["type", "attrs", "content"],
        )
      )
        return false;
      if (type === "text") {
        if (
          typeof value.text !== "string" ||
          !value.text.length ||
          !validPostgresText(value.text)
        )
          return false;
        if (value.marks !== undefined) {
          if (!Array.isArray(value.marks) || value.marks.length > marks.length)
            return false;
          const seen = new Set<string>();
          for (const mark of value.marks) {
            if (
              !object(mark) ||
              typeof mark.type !== "string" ||
              !marks.includes(mark.type) ||
              seen.has(mark.type) ||
              !keys(mark, ["type", "attrs"])
            )
              return false;
            seen.add(mark.type);
            if (mark.type === "link") {
              if (
                !object(mark.attrs) ||
                !keys(mark.attrs, ["href", "target", "rel", "class"]) ||
                !safeLink(mark.attrs.href)
              )
                return false;
              if (
                mark.attrs.target !== undefined &&
                mark.attrs.target !== null &&
                !["_blank", "_self"].includes(String(mark.attrs.target))
              )
                return false;
              if (
                mark.attrs.rel !== undefined &&
                mark.attrs.rel !== null &&
                (typeof mark.attrs.rel !== "string" ||
                  !/^(?:noopener|noreferrer|nofollow|ugc)(?: (?:noopener|noreferrer|nofollow|ugc))*$/.test(
                    mark.attrs.rel,
                  ))
              )
                return false;
              if (mark.attrs.class !== undefined && mark.attrs.class !== null)
                return false;
            } else if (
              mark.attrs !== undefined &&
              (!object(mark.attrs) || Object.keys(mark.attrs).length !== 0)
            )
              return false;
          }
        }
        return true;
      }
      const attrs = value.attrs;
      if (attrs !== undefined && !object(attrs)) return false;
      const allowedAttrs =
        type === "heading"
          ? ["level"]
          : type === "orderedList"
            ? ["start"]
            : [];
      if (attrs && !keys(attrs, allowedAttrs)) return false;
      if (
        type === "heading" &&
        (!attrs ||
          !Number.isInteger(attrs.level) ||
          Number(attrs.level) < 1 ||
          Number(attrs.level) > 6)
      )
        return false;
      if (
        type === "orderedList" &&
        attrs?.start !== undefined &&
        (!Number.isInteger(attrs.start) ||
          Number(attrs.start) < 1 ||
          Number(attrs.start) > 2147483647)
      )
        return false;
      if (value.content !== undefined && !Array.isArray(value.content))
        return false;
      const content = (value.content ?? []) as unknown[];
      if (
        ["blockquote", "bulletList", "orderedList", "listItem"].includes(
          type,
        ) &&
        !content.length
      )
        return false;
      if (
        type === "listItem" &&
        (!object(content[0]) || content[0].type !== "paragraph")
      )
        return false;
      return content.every((child) => node(child, depth + 1, type));
    }
    return node(value, 0);
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: "tipTapDocument", async: false })
export class TipTapDocumentValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return validTipTap(value);
  }
  defaultMessage() {
    return "description must be a valid supported TipTap document (64 KiB, depth 20, 2000 nodes maximum)";
  }
}
