const PALETTE = ["#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf", "#0e7490"];

/** Two letters from a name: "Wei Kang" → "WK", "Aisha" → "AI". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** The same person is the same colour everywhere, so avatars can be told apart at a glance. */
export function avatarColor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function Avatar({ userId, name, size = 24 }: { userId: string; name: string; size?: number }) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)), background: avatarColor(userId) }}
    >
      {initials(name)}
    </span>
  );
}
