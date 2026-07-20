"use client";

// Empire-name input with a dice button — naming is where new players stall.

import { useState } from "react";

const FIRST = [
  "Thorn", "Raven", "Iron", "Ember", "Stone", "Grim", "Ash", "Wolf", "Storm",
  "Briar", "Frost", "Gold", "Shadow", "Oaken", "Salt", "Drake", "Moor", "Elder",
];
const SECOND = [
  "keep", "hold", "gard", "fell", "moor", "spire", "march", "haven", "ford",
  "watch", "vale", "crag", "mere", "gate", "reach", "burg", "helm", "rest",
];

function roll(): string {
  const a = FIRST[Math.floor(Math.random() * FIRST.length)];
  let b = SECOND[Math.floor(Math.random() * SECOND.length)];
  while (a.toLowerCase().endsWith(b[0])) b = SECOND[Math.floor(Math.random() * SECOND.length)];
  return a + b;
}

export function NameField() {
  const [name, setName] = useState("");
  return (
    <>
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name your empire…"
        aria-label="Empire name"
        maxLength={30}
        autoFocus
        style={{
          padding: "4px 8px",
          border: "1px solid var(--border)",
          background: "var(--input-bg)",
          font: "15px Verdana",
        }}
      />
      <button
        type="button"
        className="btn"
        aria-label="Roll a random name"
        title="Roll a random name"
        onClick={() => setName(roll())}
      >
        🎲
      </button>
    </>
  );
}
