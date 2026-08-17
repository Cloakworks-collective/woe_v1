// The forum's channels. Part of the product, not user data — so they live in
// code, where they can be renamed without a migration and read without a query.

export interface ForumChannel {
  id: string;
  name: string;
  blurb: string;
  /** Only admins may start threads here. Everyone can still reply, unless the
   *  thread is locked — an announcement channel where nobody may answer is a
   *  noticeboard, and we already have a Chronicle for that. */
  adminOnlyThreads?: boolean;
}

export const FORUM_CHANNELS: ForumChannel[] = [
  {
    id: "changes",
    name: "Changes to the Game",
    blurb: "Patch notes and balance changes, announced by the crown. Only admins open a thread here.",
    adminOnlyThreads: true,
  },
  {
    id: "mechanics",
    name: "Game Mechanics",
    blurb: "How things actually work — combat maths, siege, growth, the ladder. Bring numbers.",
  },
  {
    id: "strategy",
    name: "Strategy Discussion",
    blurb: "Openings, builds, race picks, what to do at 2,400 regulars.",
  },
  {
    id: "politics",
    name: "Clan Politics & War",
    blurb: "Alliances, betrayals, war declarations and the arguments that follow them.",
  },
  {
    id: "bugs",
    name: "Bugs & Broken Things",
    blurb:
      "Something not working, or working in a way it plainly shouldn't? Post it here. Say what you did, what happened, and what you expected — and the turn it happened on if you have it.",
  },
  {
    id: "anything",
    name: "Anything Goes",
    blurb: "Everything else. Still a public room — the ban list applies here like anywhere.",
  },
];

export const forumChannel = (id: string): ForumChannel | undefined =>
  FORUM_CHANNELS.find((c) => c.id === id);

/** Ban lengths an admin can hand out, plus the permanent one. */
export const FORUM_BAN_DURATIONS = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "Permanent" },
] as const;

/**
 * The reaction set — FIXED, small, and the game's own. A free-form picker is
 * the "too crazy" path: it needs moderation of its own and turns every post
 * footer into a zoo. One tap toggles; one of each per reader per post.
 */
export const FORUM_REACTIONS = ["⚔️", "👍", "😂", "🏰", "💀"] as const;

/**
 * The emoji strip under the editor. Curated to the game's register — enough to
 * speak, not enough to wallpaper.
 */
export const FORUM_EMOJI = [
  "⚔️", "🛡", "🏰", "🐎", "🏹", "🔥", "💀", "👑", "🪓", "🗡",
  "😂", "😅", "😈", "🤝", "👍", "👎", "❤️", "😱", "🤔", "🙏",
  "🥖", "🪙", "🌾", "⛏",
] as const;

/**
 * Thread tags, per channel — the LEAN version of sub-forums. True sub-channels
 * fragment a small community; one optional tag from a fixed list gives the
 * sub-topic feel, filters cleanly, and stays renameable without a migration —
 * the same rule the channels themselves live by.
 */
export const CHANNEL_TAGS: Record<string, string[]> = {
  changes: ["Patch", "Balance", "New feature"],
  mechanics: ["Combat", "Siege", "Economy", "Covert", "Ranking"],
  strategy: ["Opening", "Race pick", "Build", "Endgame"],
  politics: ["Declaration", "Diplomacy", "After-action"],
  bugs: ["Bug", "UI", "Fixed"],
  anything: [],
};

export const FORUM_LIMITS = {
  HANDLE_MIN: 3,
  HANDLE_MAX: 20,
  // No PASSWORD_MIN — the forum has no passwords. It signs you in with a magic
  // link, the same gate the game uses (see lib/server/forumAuth.ts).
  TITLE_MAX: 120,
  BODY_MAX: 8000,
  PAGE_SIZE: 30,
};
