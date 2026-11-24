import { X } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import styles from "./SheetClose.module.css";

/**
 * The one close button for every slide-up sheet (owner 2026-11-23): an X inside a see-through maroon square with curved
 * corners. Pages only place it (their own className sets position); the look always comes from here.
 */
export function SheetClose({ className = "", label = "Close", ref, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & { label?: string; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} type="button" aria-label={label} className={`${styles.close} ${className}`} {...rest}>
    <X size={20} strokeWidth={2.25} aria-hidden />
  </button>;
}
