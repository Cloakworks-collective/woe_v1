import type { ReactNode } from "react";
import { cmd } from "@/app/actions";

/**
 * A form that submits one game command through the pipeline.
 * A11y: give every visible input/select inside an aria-label.
 */
export function CmdForm({
  name,
  path,
  children,
  inline = true,
}: {
  name: string;
  path: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <form action={cmd} style={inline ? { display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" } : undefined}>
      <input type="hidden" name="__cmd" value={name} />
      <input type="hidden" name="__path" value={path} />
      {children}
    </form>
  );
}
