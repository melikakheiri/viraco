import Link from "@tiptap/extension-link";

// TipTap 3 adds title:null to every link. Keep the established persisted JSON
// schema rather than widening both allowlists for an unused attribute.
export const TaskLink = Link.extend({
  addAttributes() {
    const attributes = { ...this.parent?.() };
    delete attributes.title;
    return attributes;
  },
});
