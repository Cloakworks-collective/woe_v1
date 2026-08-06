"use client";

import { createContext, useActionState, useContext, useEffect, useState, type ReactNode } from "react";
import { cmdAction } from "@/app/actions";
import { useFlash } from "@/components/FlashProvider";

/** Ticks up each time this form's command succeeds. Fields inside a CmdForm
 *  watch it to empty themselves — since commands no longer navigate, a spent
 *  amount would otherwise sit in the box looking like it still had to be sent. */
const FormResetCtx = createContext(0);

export function useFormReset() {
  return useContext(FormResetCtx);
}

/**
 * A form that submits one game command through the pipeline.
 *
 * It posts the command as a server action and stays put: no redirect, so the
 * page never scrolls back to the top. `revalidatePath` on the server re-renders
 * the affected server components in place, and the result is handed to the
 * herald for a pinned banner.
 *
 * A11y: give every visible input/select inside an aria-label.
 */
export function CmdForm({
  name,
  path,
  children,
  inline = true,
  id,
  className,
}: {
  /** Omit when the clicked submit button carries `__cmd` itself (one form,
   *  two verbs — see AssignRecall on /train). */
  name?: string;
  path: string;
  children: ReactNode;
  inline?: boolean;
  /** Give the form an id so inputs in other table cells can join it via the
   *  HTML `form={id}` attribute (a form can't wrap sibling <td>s). */
  id?: string;
  className?: string;
}) {
  // Btn already shows its own in-flight state via useFormStatus, so all this
  // form needs from the action is the result to hand to the herald.
  const [state, formAction] = useActionState(cmdAction, null);
  const [doneCount, setDoneCount] = useState(0);
  const notify = useFlash();

  useEffect(() => {
    if (!state) return;
    notify(state);
    if (state.ok) setDoneCount((n) => n + 1); // clear the fields; a failed command keeps them
  }, [state, notify]);

  return (
    <FormResetCtx.Provider value={doneCount}>
      <form
        id={id}
        action={formAction}
        className={className}
        style={inline ? { display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" } : undefined}
      >
        {name && <input type="hidden" name="__cmd" value={name} />}
        <input type="hidden" name="__path" value={path} />
        {children}
      </form>
    </FormResetCtx.Provider>
  );
}
