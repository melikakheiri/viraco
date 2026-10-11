"use client";
import { useEffect, useState } from "react";
import { validationProps } from "../lib/forms";
import { api, User, Role, roles, message } from "../lib/api";
import { useAuth } from "./auth";
import { Modal, Select } from "./task-form";
export function Users() {
  const { user, reload } = useAuth();
  const [users, setUsers] = useState<User[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    if (user.role !== "OWNER") {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    api<User[]>("/users")
      .then((data) => {
        if (active) {
          setUsers(data);
          setError("");
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
  }, [user.role, version]);
  if (user.role !== "OWNER")
    return (
      <div className="panel empty" role="alert">
        شما اجازه دسترسی به مدیریت کاربران را ندارید.
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">مدیریت سازمان</p>
          <h1>کاربران</h1>
          <p className="muted">دسترسی و وضعیت اعضای تیم را مدیریت کنید.</p>
        </div>
        <button className="primary" onClick={() => setSelected(null)}>
          ＋ کاربر جدید
        </button>
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
          <button onClick={() => setVersion((v) => v + 1)}>تلاش دوباره</button>
        </p>
      )}
      {loading ? (
        <p role="status">در حال دریافت کاربران…</p>
      ) : (
        <div className="user-list">
          {users.map((u) => (
            <article className="panel user-row" key={u.id}>
              <div>
                <strong>
                  <bdi>{u.email}</bdi>
                  {u.id === user.id && " (شما)"}
                </strong>
                <p className="muted">
                  <bdi className="identifier">{u.id}</bdi>
                </p>
              </div>
              <span>{roles[u.role]}</span>
              <span className={"badge " + (u.isActive ? "done" : "todo")}>
                {u.isActive ? "فعال" : "غیرفعال"}
              </span>
              <button onClick={() => setSelected(u)}>ویرایش دسترسی</button>
            </article>
          ))}
        </div>
      )}
      {selected !== undefined && (
        <UserForm
          selected={selected}
          onClose={() => setSelected(undefined)}
          onSaved={async () => {
            setSelected(undefined);
            setNotice("اطلاعات کاربر ذخیره شد.");
            setVersion((v) => v + 1);
            try {
              await reload();
            } catch (e) {
              setError(message(e));
            }
          }}
        />
      )}
    </>
  );
}
function UserForm({
  selected,
  onClose,
  onSaved,
}: {
  selected: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>(selected?.role || "MEMBER"),
    [active, setActive] = useState(selected?.isActive ?? true),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={selected ? "ویرایش دسترسی کاربر" : "ایجاد کاربر"}
      onClose={onClose}
      busy={busy}
    >
      <form
        {...validationProps}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (
            !selected &&
            (password.length < 12 ||
              new TextEncoder().encode(password).length > 72)
          ) {
            setError("رمز عبور باید حداقل ۱۲ نویسه و حداکثر ۷۲ بایت باشد.");
            return;
          }
          setBusy(true);
          try {
            await api(
              selected ? "/users/" + selected.id : "/users",
              selected ? "PATCH" : "POST",
              selected
                ? { role, isActive: active }
                : { email: email.trim(), password, role },
            );
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {selected ? (
          <p>
            <bdi>{selected.email}</bdi>
          </p>
        ) : (
          <>
            <label>
              ایمیل
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                autoComplete="off"
              />
            </label>
            <label>
              رمز عبور
              <input
                type="password"
                required
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                autoComplete="new-password"
              />
              <small>حداقل ۱۲ نویسه؛ حداکثر ۷۲ بایت</small>
            </label>
          </>
        )}
        <Select
          label="نقش"
          value={role}
          onChange={(v) => setRole(v as Role)}
          options={roles}
        />
        {selected && (
          <label className="check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            حساب فعال باشد
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? "در حال ذخیره…" : "ذخیره کاربر"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}
