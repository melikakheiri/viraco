"use client";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import { useState } from "react";
import { validationProps } from "../lib/forms";
import {
  api,
  Doc,
  Task,
  Assignee,
  statuses,
  priorities,
  message,
} from "../lib/api";
import { Editor } from "./editor";
import { validTipTap } from "../lib/document";
import { useAuth } from "./auth";
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Record<string, string>;
}) {
  return (
    <div className="select-field">
      <Listbox value={value} onChange={onChange}>
        <span className="field-label">{label}</span>
        <ListboxButton aria-label={label} className="select-button">
          {options[value] || value}
          <span aria-hidden="true">⌄</span>
        </ListboxButton>
        <ListboxOptions anchor="bottom start" className="options" dir="rtl">
          {Object.entries(options).map(([key, label]) => (
            <ListboxOption key={key} value={key} className="option">
              {label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      className="dialog"
    >
      <div className="backdrop" />
      <div className="dialog-position">
        <DialogPanel className="panel dialog-panel">
          <div className="title-row">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            <button aria-label="بستن" disabled={busy} onClick={onClose}>
              ×
            </button>
          </div>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
export function TaskForm({
  task,
  users,
  onClose,
  onSaved,
}: {
  task?: Task;
  users: Assignee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task?.title || ""),
    [status, setStatus] = useState(task?.status || "todo"),
    [priority, setPriority] = useState(task?.priority || "medium"),
    [assignee, setAssignee] = useState(task?.assigneeId || ""),
    [due, setDue] = useState(
      task?.dueDate
        ? new Date(
            new Date(task.dueDate).getTime() -
              new Date(task.dueDate).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [description, setDescription] = useState<Doc>(
      task?.description || { type: "doc", content: [] },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const assignees: Record<string, string> = {
    "": "بدون مسئول",
    [user.id]: "خودم",
    ...Object.fromEntries(users.map((u) => [u.id, u.email])),
  };
  if (task?.assigneeId && !assignees[task.assigneeId])
    assignees[task.assigneeId] = task.assigneeId;
  return (
    <Modal
      title={task ? "ویرایش وظیفه" : "وظیفه جدید"}
      onClose={onClose}
      busy={busy}
    >
      <form
        {...validationProps}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (!title.trim()) {
            setError("عنوان وظیفه الزامی است.");
            return;
          }
          if (!validTipTap(description)) {
            setError(
              "ساختار توضیحات معتبر نیست یا از محدودیت ۶۴ کیلوبایت، عمق ۲۰ یا ۲۰۰۰ گره عبور کرده است.",
            );
            return;
          }
          setBusy(true);
          try {
            await api(
              task ? "/todos/" + task.id : "/todos",
              task ? "PATCH" : "POST",
              {
                title: title.trim(),
                status,
                priority,
                description,
                dueDate: due ? new Date(due).toISOString() : null,
                ...(assignee !== (task?.assigneeId || "") || !task
                  ? { assigneeId: assignee || null }
                  : {}),
              },
            );
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          عنوان وظیفه <span aria-hidden="true">*</span>
          <input
            autoFocus
            required
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <Select
            label="وضعیت"
            value={status}
            onChange={(v) => setStatus(v as Task["status"])}
            options={statuses}
          />
          <Select
            label="اولویت"
            value={priority}
            onChange={(v) => setPriority(v as Task["priority"])}
            options={priorities}
          />
        </div>
        {
          <Select
            label="مسئول"
            value={assignee}
            onChange={setAssignee}
            options={
              user.role === "MEMBER"
                ? {
                    "": "بدون مسئول",
                    [user.id]: "خودم",
                    ...(task?.assigneeId && task.assigneeId !== user.id
                      ? { [task.assigneeId]: "مسئول فعلی" }
                      : {}),
                  }
                : assignees
            }
          />
        }
        <label>
          موعد انجام (تقویم میلادی)
          <input
            type="datetime-local"
            dir="ltr"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <div>
          <span className="field-label">توضیحات</span>
          <Editor value={description} onChange={setDescription} />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? "در حال ذخیره…" : "ذخیره وظیفه"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function DeleteTask({
  task,
  onClose,
  onDeleted,
}: {
  task: Task;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="حذف وظیفه" onClose={onClose} busy={busy}>
      <p>وظیفه «{task.title}» حذف شود؟ این عملیات قابل بازگشت نیست.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await api("/todos/" + task.id, "DELETE");
              onDeleted();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "در حال حذف…" : "حذف وظیفه"}
        </button>
        <button disabled={busy} onClick={onClose} autoFocus>
          انصراف
        </button>
      </div>
    </Modal>
  );
}
