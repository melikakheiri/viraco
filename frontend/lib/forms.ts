import type { FormEvent } from "react";
export const validationProps = {
  onInvalid(event: FormEvent<HTMLFormElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    input.setCustomValidity("");
    const v = input.validity;
    input.setCustomValidity(
      v.valueMissing
        ? "این فیلد الزامی است."
        : v.typeMismatch
          ? "لطفاً نشانی معتبر وارد کنید."
          : v.patternMismatch
            ? "شناسه باید یک UUID معتبر باشد."
            : v.tooShort
              ? "مقدار واردشده کوتاه‌تر از حد مجاز است."
              : "مقدار واردشده معتبر نیست.",
    );
  },
  onInput(event: FormEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLInputElement)
      event.target.setCustomValidity("");
  },
};
