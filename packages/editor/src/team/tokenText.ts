/**
 * What a teammate pastes into a terminal to connect their Claude Code (spec
 * §6.1). `--scope user` keeps the token in their own Claude Code settings,
 * never in a project's .mcp.json, which could be committed to this public
 * repo.
 */
export function connectCommand(origin: string, secret: string): string {
  return `claude mcp add --transport http --scope user oth ${origin.replace(/\/+$/, "")}/mcp --header "Authorization: Bearer ${secret}"`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Oct", in this browser's time: when a token was made, or when it runs out. */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
