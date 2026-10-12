"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskLink } from "../lib/task-link";
import { useState } from "react";
import { Doc, safeLink } from "../lib/api";
import { validTipTap } from "../lib/document";
export function Editor({
  value,
  onChange,
}: {
  value: Doc;
  onChange: (doc: Doc) => void;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        trailingNode: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      TaskLink.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        validate: safeLink,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        dir: "rtl",
        "aria-label": "توضیحات وظیفه",
        "aria-placeholder": "توضیحات وظیفه را اینجا بنویسید…",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => event.key === "Enter" && event.shiftKey,
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as Doc),
  });
  if (!editor) return <p role="status">در حال آماده‌سازی ویرایشگر…</p>;
  const tools: [string, () => void, boolean][] = [
    [
      "پاراگراف",
      () => editor.chain().setParagraph().run(),
      editor.isActive("paragraph"),
    ],
    ["پررنگ", () => editor.chain().toggleBold().run(), editor.isActive("bold")],
    [
      "مورب",
      () => editor.chain().toggleItalic().run(),
      editor.isActive("italic"),
    ],
    [
      "عنوان",
      () => editor.chain().toggleHeading({ level: 2 }).run(),
      editor.isActive("heading"),
    ],
    [
      "فهرست",
      () => editor.chain().toggleBulletList().run(),
      editor.isActive("bulletList"),
    ],
    [
      "فهرست شماره‌دار",
      () => editor.chain().toggleOrderedList().run(),
      editor.isActive("orderedList"),
    ],
    [
      "نقل‌قول",
      () => editor.chain().toggleBlockquote().run(),
      editor.isActive("blockquote"),
    ],
  ];
  return (
    <div className="editor">
      <div className="toolbar" role="group" aria-label="قالب‌بندی متن">
        {tools.map(([label, action, active]) => (
          <button
            type="button"
            key={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.view.focus();
              action();
            }}
            aria-pressed={active}
          >
            {label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
      <div className="link-tools">
        <input
          aria-label="نشانی پیوند"
          type="url"
          dir="ltr"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            if (!safeLink(url)) {
              setError(
                "نشانی معتبر با http یا https و بدون نام کاربری وارد کنید.",
              );
              return;
            }
            editor.view.focus();
            editor.chain().extendMarkRange("link").setLink({ href: url }).run();
            setError("");
          }}
        >
          درج پیوند
        </button>
        <button
          type="button"
          onClick={() => {
            editor.view.focus();
            editor.chain().unsetLink().run();
          }}
        >
          حذف پیوند
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function RichText({ doc }: { doc: Doc }) {
  if (!validTipTap(doc))
    return <p className="error">توضیحات ذخیره‌شده قابل نمایش نیست.</p>;
  const hasText = (node: Doc): boolean =>
    Boolean(node.text?.trim() || node.content?.some(hasText));
  let count = 0;
  function render(node: Doc, index: number, depth: number): React.ReactNode {
    if (++count > 2000 || depth > 20) return null;
    const children = node.content?.map((child, i) =>
      render(child, i, depth + 1),
    );
    if (node.type === "text") {
      let text: React.ReactNode = node.text;
      for (const mark of node.marks || []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        if (mark.type === "italic") text = <em>{text}</em>;
        if (mark.type === "link" && safeLink(mark.attrs?.href))
          text = (
            <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          );
      }
      return <span key={index}>{text}</span>;
    }
    switch (node.type) {
      case "doc":
        return <div key={index}>{children}</div>;
      case "paragraph":
        return <p key={index}>{children || <br />}</p>;
      case "heading": {
        const level = Number(node.attrs?.level);
        if (level === 1) return <h1 key={index}>{children}</h1>;
        if (level === 3) return <h3 key={index}>{children}</h3>;
        if (level === 4) return <h4 key={index}>{children}</h4>;
        if (level === 5) return <h5 key={index}>{children}</h5>;
        if (level === 6) return <h6 key={index}>{children}</h6>;
        return <h2 key={index}>{children}</h2>;
      }
      case "bulletList":
        return <ul key={index}>{children}</ul>;
      case "orderedList":
        return (
          <ol key={index} start={Number(node.attrs?.start) || 1}>
            {children}
          </ol>
        );
      case "listItem":
        return <li key={index}>{children}</li>;
      case "blockquote":
        return <blockquote key={index}>{children}</blockquote>;
      default:
        return null;
    }
  }
  return (
    <div className="richtext" dir="rtl">
      {hasText(doc) ? (
        render(doc, 0, 0)
      ) : (
        <p className="muted">توضیحی ثبت نشده است.</p>
      )}
    </div>
  );
}
