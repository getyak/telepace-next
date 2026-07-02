import * as React from "react";
import { cn } from "../cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const inputBase =
  "w-full bg-transparent text-ink placeholder:text-muted " +
  "border border-hairline rounded-input px-3 py-2 " +
  "focus-visible:outline-none focus-visible:border-ink focus-visible:ring-0";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputBase, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputBase, "min-h-[80px] resize-y", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("block text-sm text-body mb-1.5", className)} {...p} />
);
