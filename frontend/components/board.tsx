"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  Task,
  Assignee,
  canDelete,
  statuses,
  priorities,
  date,
  message,
} from "../lib/api";
import { useAuth } from "./auth";
import { TaskForm, DeleteTask, Select } from "./task-form";
export function Board() {
  const { user } = useAuth();
  const [items, setItems] = useState<Task[]>([]),
    [users, setUsers] = useState<Assignee[]>([]),
    [status, setStatus] = useState(""),
    [assignee, setAssignee] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [edit, setEdit] = useState<Task | null | undefined>(undefined),
    [remove, setRemove] = useState<Task | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), pageSize: "12" });
    if (status) query.set("status", status);
    if (filter) query.set("assigneeId", filter);
    api<{ items: Task[]; total: number }>("/todos?" + query)
      .then((data) => {
        if (active) {
          setItems(data.items);
          setTotal(data.total);
          if (page > 1 && data.total <= (page - 1) * 12)
            setPage(Math.max(1, Math.ceil(data.total / 12)));
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, status, filter, version]);
  useEffect(() => {
    if (user.role === "MEMBER") return;
    let active = true;
    api<Assignee[]>("/assignees")
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [user.role, version]);
  const person = (id: string | null) =>
    !id
      ? "بدون مسئول"
      : id === user.id
        ? "شما"
        : users.find((u) => u.id === id)?.email || id;
  const changed = (text: string) => {
    setNotice(text);
    setEdit(undefined);
    setRemove(null);
    setVersion((v) => v + 1);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">فضای کار تیم</p>
          <h1>برد وظایف</h1>
          <p className="muted">
            کارها را پیگیری کنید، اولویت بدهید و به نتیجه برسانید.
          </p>
        </div>
        <button className="primary" onClick={() => setEdit(null)}>
          ＋ وظیفه جدید
        </button>
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <section className="panel filters" aria-label="فیلتر وظایف">
        <Select
          label="وضعیت"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={{ "": "همه وضعیت‌ها", ...statuses }}
        />
        {user.role !== "MEMBER" ? (
          <Select
            label="مسئول"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={{
              "": "همه مسئول‌ها",
              ...Object.fromEntries(users.map((u) => [u.id, u.email])),
            }}
          />
        ) : (
          <form
            className="assignee-filter"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter(assignee);
              setPage(1);
            }}
          >
            <label>
              فیلتر شناسه مسئول
              <input
                aria-label="شناسه مسئول"
                dir="ltr"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              />
            </label>
            <button>اعمال</button>
            <button
              type="button"
              onClick={() => {
                setAssignee(user.id);
                setFilter(user.id);
                setPage(1);
              }}
            >
              وظایف من
            </button>
          </form>
        )}
        <button
          onClick={() => {
            setStatus("");
            setFilter("");
            setAssignee("");
            setPage(1);
          }}
        >
          پاک‌کردن فیلترها
        </button>
      </section>
      <div className="list-heading">
        <h2>وظایف تیم</h2>
        <span className="muted">{total.toLocaleString("fa-IR")} وظیفه</span>
      </div>
      {loading ? (
        <div className="panel empty" role="status">
          در حال دریافت وظایف…
        </div>
      ) : error ? (
        <div className="panel empty error" role="alert">
          {error}
          <button onClick={() => setVersion((v) => v + 1)}>تلاش دوباره</button>
        </div>
      ) : items.length === 0 ? (
        <div className="panel empty">
          <h2>هنوز وظیفه‌ای در این فهرست نیست</h2>
          <p className="muted">
            فیلترها را تغییر دهید یا یک وظیفه جدید بسازید.
          </p>
          <button onClick={() => setEdit(null)}>ایجاد وظیفه</button>
        </div>
      ) : (
        <div className="task-grid">
          {items.map((task) => (
            <article key={task.id} className="panel task-card">
              <div className="title-row">
                <span className={"badge " + task.status}>
                  {statuses[task.status]}
                </span>
                <span className={"priority " + task.priority}>
                  ● اولویت {priorities[task.priority]}
                </span>
              </div>
              <h3>
                <Link href={"/tasks/" + task.id}>{task.title}</Link>
              </h3>
              <dl>
                <div>
                  <dt>موعد</dt>
                  <dd
                    className={
                      task.dueDate &&
                      new Date(task.dueDate) < new Date() &&
                      task.status !== "done"
                        ? "overdue"
                        : ""
                    }
                  >
                    {date(task.dueDate)}
                  </dd>
                </div>
                <div>
                  <dt>مسئول</dt>
                  <dd>
                    <bdi>{person(task.assigneeId)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>ایجادکننده</dt>
                  <dd>
                    <bdi>{person(task.creatorId)}</bdi>
                  </dd>
                </div>
              </dl>
              <div className="card-actions">
                <Link href={"/tasks/" + task.id}>جزئیات</Link>
                <button onClick={() => setEdit(task)}>ویرایش</button>
                {canDelete(user, task) && (
                  <button
                    className="text-danger"
                    onClick={() => setRemove(task)}
                  >
                    حذف
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <nav className="pagination" aria-label="صفحه‌بندی">
        <button
          disabled={page === 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          صفحه قبل
        </button>
        <span>
          صفحه {page.toLocaleString("fa-IR")} از{" "}
          {Math.max(1, Math.ceil(total / 12)).toLocaleString("fa-IR")}
        </span>
        <button
          disabled={page * 12 >= total || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          صفحه بعد
        </button>
      </nav>
      {edit !== undefined && (
        <TaskForm
          task={edit || undefined}
          users={users}
          onClose={() => setEdit(undefined)}
          onSaved={() => changed("وظیفه با موفقیت ذخیره شد.")}
        />
      )}{" "}
      {remove && (
        <DeleteTask
          task={remove}
          onClose={() => setRemove(null)}
          onDeleted={() => changed("وظیفه حذف شد.")}
        />
      )}
    </>
  );
}
export function TaskDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null),
    [users, setUsers] = useState<Assignee[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api<Task>("/todos/" + id)
      .then((t) => {
        if (active) {
          setTask(t);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    if (user.role !== "MEMBER")
      api<Assignee[]>("/assignees")
        .then((u) => {
          if (active) setUsers(u);
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    return () => {
      active = false;
    };
  }, [id, version, user.role]);
  const person = (id: string | null) =>
    id === user.id
      ? user.email
      : users.find((u) => u.id === id)?.email || id || "بدون مسئول";
  return (
    <>
      <Link href="/">← بازگشت به وظایف</Link>
      {error ? (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setVersion((v) => v + 1)}>تلاش دوباره</button>
        </div>
      ) : !task ? (
        <p role="status">در حال دریافت وظیفه…</p>
      ) : (
        <>
          <div className="page-heading">
            <h1>{task.title}</h1>
            <div className="actions">
              <button onClick={() => setEditing(true)}>ویرایش</button>
              {canDelete(user, task) && (
                <button className="danger" onClick={() => setDeleting(true)}>
                  حذف
                </button>
              )}
            </div>
          </div>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <article className="panel detail">
            <div className="actions">
              <span className={"badge " + task.status}>
                {statuses[task.status]}
              </span>
              <span>اولویت {priorities[task.priority]}</span>
            </div>
            <dl>
              <div>
                <dt>مسئول</dt>
                <dd>
                  <bdi>{person(task.assigneeId)}</bdi>
                </dd>
              </div>
              <div>
                <dt>ایجادکننده</dt>
                <dd>
                  <bdi>{person(task.creatorId)}</bdi>
                </dd>
              </div>
              <div>
                <dt>موعد انجام</dt>
                <dd>{date(task.dueDate)}</dd>
              </div>
              <div>
                <dt>تاریخ ایجاد</dt>
                <dd>{date(task.createdAt)}</dd>
              </div>
              <div>
                <dt>آخرین تغییر</dt>
                <dd>{date(task.updatedAt)}</dd>
              </div>
            </dl>
            <h2>توضیحات</h2>
            <RichText doc={task.description} />
          </article>
          {editing && (
            <TaskForm
              task={task}
              users={users}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setNotice("تغییرات ذخیره شد.");
                setVersion((v) => v + 1);
              }}
            />
          )}
          {deleting && (
            <DeleteTask
              task={task}
              onClose={() => setDeleting(false)}
              onDeleted={() => window.location.assign("/")}
            />
          )}
        </>
      )}
    </>
  );
}
import { RichText } from "./editor";
