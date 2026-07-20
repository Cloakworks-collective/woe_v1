"use client";

import { useState } from "react";

// The Crown Chamber login. Client-side only for the show/hide toggle — the
// `action` is the server action passed down from the admin page.
export function AdminLoginForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [show, setShow] = useState(false);

  return (
    <form action={action} style={{ display: "flex", gap: 8 }}>
      <div style={{ position: "relative", flex: 1, display: "flex" }}>
        <input
          type={show ? "text" : "password"}
          name="password"
          placeholder="the crown's password"
          aria-label="Admin password"
          autoFocus
          style={{
            padding: "4px 34px 4px 8px",
            border: "1px solid var(--border)",
            background: "var(--input-bg)",
            font: "15px Verdana",
            flex: 1,
            width: "100%",
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          {show ? "🙈" : "👁"}
        </button>
      </div>
      <button className="btn">Enter</button>
    </form>
  );
}
