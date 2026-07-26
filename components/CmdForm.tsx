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
  id,
}: {
  name: string;
  path: string;
  children: ReactNode;
  inline?: boolean;
  /** Give the form an id so inputs in other table cells can join it via the
   *  HTML `form={id}` attribute (a form can't wrap sibling <td>s). */
  id?: string;
}) {
  return (
    <form id={id} action={cmd} style={inline ? { display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" } : undefined}>
      <input type="hidden" name="__cmd" value={name} />
      <input type="hidden" name="__path" value={path} />
      {children}
    </form>
  );
}
