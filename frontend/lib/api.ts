export type Role = "OWNER" | "MANAGER" | "MEMBER";
export interface User {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
}
export type Assignee = Pick<User, "id" | "email">;
export interface Doc {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: Doc[];
}
export interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  creatorId: string;
  assigneeId: string | null;
  dueDate: string | null;
  description: Doc;
  createdAt: string;
  updatedAt: string;
}
export const statuses = {
  todo: "برای انجام",
  in_progress: "در حال انجام",
  done: "انجام شده",
};
export const priorities = { low: "کم", medium: "متوسط", high: "زیاد" };
export const roles = { OWNER: "مالک", MANAGER: "مدیر", MEMBER: "عضو" };
export const canDelete = (user: User, task: Task) =>
  user.role !== "MEMBER" || task.creatorId === user.id;
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "بدون موعد";
export class ApiError extends Error {
  constructor(
    public status: number,
    detail?: string,
  ) {
    super(
      detail ||
        (
          {
            400: "اطلاعات واردشده معتبر نیست. مقادیر فرم را بررسی کنید.",
            401: "نشست شما پایان یافته است. دوباره وارد شوید.",
            403: "اجازه انجام این عملیات را ندارید؛ نقش یا مسئول انتخاب‌شده را بررسی کنید.",
            404: "مورد درخواستی پیدا نشد.",
            409: "اطلاعات تکراری است یا این تغییر آخرین مالک فعال را حذف می‌کند.",
            429: "تعداد تلاش‌ها بیش از حد مجاز است. یک دقیقه صبر کنید و دوباره تلاش کنید.",
            500: "خطای سرور رخ داد. دوباره تلاش کنید.",
          } as Record<number, string>
        )[status] ||
        "ارتباط با سرویس برقرار نشد. دوباره تلاش کنید.",
    );
  }
}
let refreshing: Promise<Response> | null = null;
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("مسیر نامعتبر");
  const send = () =>
    fetch("/api/v1" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let response: Response;
  try {
    response = await send();
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/refresh", "/auth/logout"].includes(path)
    ) {
      if (!refreshing)
        refreshing = fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).finally(() => {
          refreshing = null;
        });
      const refreshed = await refreshing;
      if (refreshed.ok) response = await send();
      else response = refreshed;
    }
  } catch {
    throw new ApiError(503);
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      response.status,
      path === "/auth/login" && response.status === 401
        ? "ایمیل یا رمز عبور نادرست است."
        : undefined,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "خطای غیرمنتظره رخ داد.";
export function safeLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !/^https?:\/\//i.test(value) ||
    /\s/u.test(value) ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
