/** What to send a teammate: where to go, how to sign in, and what happens next. */
export function inviteMessage(kind: "invite" | "reset", origin: string, email: string, password: string): string {
  const opening =
    kind === "invite"
      ? "You're invited to the OTH map tools, where we survey and build Our Tampines Hub floor by floor."
      : "Your password for the OTH map tools has been reset.";
  return [
    opening,
    "",
    `Open: ${origin}`,
    `Email: ${email}`,
    `One-time password: ${password}`,
    "",
    "After signing in you'll be asked to set your own password.",
  ].join("\n");
}
