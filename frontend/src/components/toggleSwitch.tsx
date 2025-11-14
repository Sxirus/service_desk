// src/components/ToggleSwitch.tsx
import { useState } from "react";

type Props = {
  defaultChecked?: boolean;
  eventName?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export default function ToggleSwitch({
  defaultChecked = false,
  eventName = "",
  label = "AN",
  disabled = false,
  className = "",
}: Props) {
  const [value, setValue] = useState(defaultChecked);

  const switched = (next: boolean) => {
    if (!eventName || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent (eventName, { detail: {value: next }})
    );
  }

  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <input
        type="checkbox"
        className="sr-only peer"
        disabled={disabled}
        checked={value}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          switched(next);
        }}
        aria-checked={value}
        role="switch"
      />

      <span
        className="
          relative h-6 w-11 rounded-full bg-gray-300 transition-colors
          peer-checked:bg-black
          after:content-[''] after:absolute after:left-1 after:top-1
          after:h-4 after:w-4 after:rounded-full after:bg-white
          after:transition-transform
          peer-checked:after:translate-x-5
        "
      />

      <span className="text-sm select-none">{label}</span>
    </label>
  );
}
