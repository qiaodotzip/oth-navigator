# Workspace Overhaul, Plan 1 of 4 — Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One signed-in application shell — Floors home, floor workspace with Survey · Review · Build tabs, team and account screens, toasts with undo — that the later plans fill in.

**Architecture:** Rebuild the screens in place in `packages/editor`, keeping the model, server, store, saver and every pure function. New pieces: a small `ui/` kit on design tokens (Radix only for dialog, popover and toast), a typed URL scheme on the existing hand-rolled router, pure progress functions, a shell, a Floors home and a Team page. Server gains level owners, a must-change-password flag, team endpoints, a change-password route, restore endpoints and a latest-published endpoint. Until Plans 2 and 3 land, the floor tabs host the existing Survey, Review and Build screens inside the new shell, so the app stays runnable.

**Tech Stack:** React 18, TypeScript (strict), Vite 5, Tailwind 3, zustand 4, Radix UI (`@radix-ui/react-dialog`, `-popover`, `-toast`), `@fontsource-variable/inter`, Hono, Drizzle (PGlite in dev and tests), Vitest 1.6 + Testing Library.

**Spec:** [`docs/design-and-plans/specs/2026-09-27-workspace-overhaul-design.md`](../specs/2026-09-27-workspace-overhaul-design.md) — §5 (structure), §6 (shell), §7 (Floors home), §8 (team and account), §12 (look), §14 (testing). Read it first.

## Global Constraints

- Work in the worktree `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul` on branch `ux-overhaul`. Never `cd` to the main checkout.
- Stage files by path. Never `git add -A` or `git add .` at the worktree root: `.superpowers/` there is untracked mockup output.
- Every test run is throttled: `npx vitest run <files> --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`, from the worktree root. Never run the whole suite unthrottled — it has frozen this laptop before.
- TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`: `npx tsc -b` must pass before every commit.
- New runtime dependencies allowed in this plan, and only these: `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-toast`, `@fontsource-variable/inter` (all in `@oth/editor`).
- Component tests drive mouse events, not pointer events: jsdom gives `PointerEvent` no coordinates.
- Colour tokens (spec §12), exact: accent `#0f766e` (hover `#115e59`, soft `#f0fdfa`, ring `#14b8a6`); yours `#b45309` / soft `#fef3c7`; proposed `#0284c7` / soft `#e0f2fe`; confirmed `#047857` / soft `#d1fae5`; danger `#b91c1c` / soft `#fee2e2`; neutrals are Tailwind `stone`.
- Type: Inter; `text-xs` becomes 13 px / 18 px and `text-sm` 14 px / 20 px; no text smaller than 13 px, avatar initials excepted.
- Copy: second person, sentence case, loading text ends with `…`, errors say what to do next, and no screen ever tells a teammate to run a terminal command.
- Colour is never the only signal: every status also carries a word or an icon.
- A flat team: anyone signed in may invite, reset a password, assign floor owners and publish (spec §4).
- Comments explain *why*, in the repo's existing voice; commit messages are `type(scope): summary` with an explanatory body, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A session expiring mid-work** (any write returning 401) should keep the page and show a sign-in dialog over it, not throw you to a blank login screen — pinned in Task 8 (saver) and Task 13 (AuthGate).
2. **A floor URL typed by hand** — lowercase `/floors/l1/build`, or a floor that does not exist, `/floors/L9/survey` — should open L1, or go to Floors with a message, never a blank screen — pinned in Task 3 and Task 16.
3. **Undo after a teammate has touched the same thing** should say it could not undo and why, not crash or silently overwrite — pinned in Task 10.
4. **A one-time password dialog closed before copying** must actually forget the password (it is shown once), and the team page must make clear it can be reset again — pinned in Task 15.
5. **Owners that are not on the team** (a removed account still in `ownerIds`) and **floors with no owner** should render as "Former teammate" / "+ Owner", and "your floor" must still resolve — pinned in Task 9 and Task 14.

---

## File map

```
packages/model/src/
  schema/building.ts            MODIFY  LevelSchema.ownerIds
  schema/building.test.ts       MODIFY
  survey/levels.ts              CREATE  placeLevels, placeLevel
  survey/levels.test.ts         CREATE
  bundle/build.ts               MODIFY  owners never published
  bundle/build.test.ts          MODIFY
  index.ts                      MODIFY  export survey/levels

packages/server/src/
  db/schema.ts                  MODIFY  levels.owner_ids, users.must_change_password
  drizzle/0010_*.sql            CREATE  (generated)
  auth/users.ts                 MODIFY  User.mustChangePassword
  auth/sessions.ts              MODIFY  resolveSession returns it
  auth/routes.ts                MODIFY  login returns it; POST /password
  auth/routes.test.ts           MODIFY
  cli/invite.ts                 MODIFY  invite/reset set the flag; invitedBy
  cli/invite.test.ts            MODIFY
  users/routes.ts               CREATE  GET /, POST /invite, POST /:id/reset-password
  users/routes.test.ts          CREATE
  publish/routes.ts             MODIFY  GET /publish/latest
  entities/repository.ts        MODIFY  restoreEntity, NotDeletedError
  entities/routes.ts            MODIFY  POST /:type/:id/restore
  entities/routes.test.ts       MODIFY
  survey/routes.ts              MODIFY  POST /keyframes/:id/restore
  survey/routes.test.ts         MODIFY
  app.ts                        MODIFY  mount /api/users

packages/editor/
  package.json                  MODIFY  four dependencies
  tailwind.config.ts            MODIFY  tokens
  src/styles.css                MODIFY  base + focus ring
  src/main.tsx                  MODIFY  font, Root → Workspace, Toaster
  src/testing/setup.ts          MODIFY  ResizeObserver stub
  src/testing/fakeApi.ts        CREATE  shared fake Api + sample model
  src/ui/{Button,Kbd,Chip,Avatar,Progress,YoursTag}.tsx   CREATE
  src/ui/{Dialog,Popover,Toaster}.tsx, toast.ts            CREATE
  src/ui/{undo,remember,relativeTime}.ts                   CREATE
  src/route.ts                  MODIFY  parseRoute, href, useCurrentRoute, navigate(replace), setParams, followLink
  src/api/client.ts             MODIFY  team, password, restore, latest, health
  src/state/store.ts            MODIFY  team, sessionEnd, endSession
  src/state/save.ts             MODIFY  401 → endSession("expired")
  src/flow/floors.ts            CREATE  sortedLevels, findLevel, yourFloor, pickTab
  src/flow/floorProgress.ts     CREATE  BUILD_STEPS, buildStepForCode, buildStepsDone, floorProgress, waitingReview, nextStepText
  src/flow/publishBlockers.ts   CREATE
  src/auth/LoginScreen.tsx      MODIFY  LoginForm extracted
  src/auth/AuthGate.tsx         MODIFY  session-expired dialog
  src/shell/{AppShell,Header,FloorSwitcher,FloorTabs,PresenceAvatars,OwnerAvatars}.tsx  CREATE
  src/shell/{PublishButton,AccountMenu,ChangePasswordDialog,PasswordBanner,OfflineBanner,StatusToasts}.tsx  CREATE
  src/shell/Workspace.tsx       CREATE  the route switch
  src/home/{FloorsHome,FloorCard,OwnerPicker}.tsx           CREATE
  src/team/{TeamPage,InviteDialog,OneTimePasswordDialog}.tsx, inviteMessage.ts  CREATE
  src/floor/FloorWorkspace.tsx  CREATE  interim host for the old screens
  src/App.tsx                   MODIFY  `embedded` prop
  src/survey/SurveyApp.tsx      MODIFY  `embedded` prop
```

---

### Task 1: The look — tokens, font, focus ring, and the small `ui/` pieces

**Files:**
- Modify: `packages/editor/package.json`, `packages/editor/tailwind.config.ts`, `packages/editor/src/styles.css`, `packages/editor/src/main.tsx:1-8`
- Create: `packages/editor/src/ui/Button.tsx`, `Kbd.tsx`, `Chip.tsx`, `Avatar.tsx`, `Progress.tsx`, `YoursTag.tsx`
- Test: `packages/editor/src/ui/primitives.test.tsx`

**Interfaces:**
- Produces: `Button` (`variant?: "primary" | "secondary" | "ghost" | "danger"`, `size?: "sm" | "md"`, forwards ref, defaults `type="button"`); `Kbd({ children: string })`; `Chip({ selected?, count?, onClick?, children })`; `Avatar({ userId, name, size? })`, `initials(name): string`, `avatarColor(userId): string`; `Progress({ value, max, label, tone?: "accent" | "proposed" | "confirmed" })`; `YoursTag()`. Tailwind colour names `accent`, `yours`, `proposed`, `confirmed`, `danger` (each with `soft`; accent also `hover`, `ring`).

- [ ] **Step 1: Install the font**

Run: `npm install @fontsource-variable/inter@^5 --workspace @oth/editor --no-audit --no-fund`
Expected: `added 1 package`; `packages/editor/package.json` lists `@fontsource-variable/inter`.

- [ ] **Step 2: Write the failing test**

Create `packages/editor/src/ui/primitives.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, avatarColor, initials } from "./Avatar";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Progress } from "./Progress";

describe("initials", () => {
  it("takes the first and last word's letters", () => {
    expect(initials("Wei Kang Tan")).toBe("WT");
  });
  it("takes two letters of a single name", () => {
    expect(initials("aisha")).toBe("AI");
  });
  it("never renders blank", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("Avatar", () => {
  it("names the person for assistive tech", () => {
    render(<Avatar userId="user_1" name="Wei Kang" />);
    expect(screen.getByRole("img", { name: "Wei Kang" }).textContent).toBe("WK");
  });
  it("gives the same person the same colour every time", () => {
    expect(avatarColor("user_1")).toBe(avatarColor("user_1"));
  });
});

describe("Button", () => {
  it("is a plain button unless told otherwise, so it never submits a form by accident", () => {
    render(<form><Button>Go</Button></form>);
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("type")).toBe("button");
  });
});

describe("Chip", () => {
  it("reports whether it is on, and its count", () => {
    const onClick = vi.fn();
    render(<Chip selected count={214} onClick={onClick}>Untagged</Chip>);
    const chip = screen.getByRole("button", { name: /untagged/i });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.textContent).toContain("214");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Progress", () => {
  it("exposes its numbers, clamped to the maximum", () => {
    render(<Progress value={9} max={6} label="Build progress" />);
    const bar = screen.getByRole("progressbar", { name: "Build progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
  });
  it("is empty rather than broken when there is nothing to count", () => {
    render(<Progress value={0} max={0} label="Survey progress" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run packages/editor/src/ui/primitives.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `Failed to resolve import "./Avatar"`.

- [ ] **Step 4: Write the tokens, the base styles and the components**

Replace `packages/editor/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

/**
 * The look, in one place: warm greys, one teal accent, and a colour per
 * meaning. Components use these names, never raw hex, so "proposed" is the
 * same blue in the filmstrip, the review queue and the frame boxes.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"] },
      // One step up from Tailwind's defaults: 13 px is the smallest text anywhere.
      fontSize: {
        xs: ["13px", "18px"],
        sm: ["14px", "20px"],
      },
      colors: {
        accent: { DEFAULT: "#0f766e", hover: "#115e59", soft: "#f0fdfa", ring: "#14b8a6" },
        yours: { DEFAULT: "#b45309", soft: "#fef3c7" },
        proposed: { DEFAULT: "#0284c7", soft: "#e0f2fe" },
        confirmed: { DEFAULT: "#047857", soft: "#d1fae5" },
        danger: { DEFAULT: "#b91c1c", soft: "#fee2e2" },
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
} satisfies Config;
```

Replace `packages/editor/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }

@layer base {
  body { @apply bg-stone-50 text-sm text-stone-900 antialiased; }
  /* One visible focus ring everywhere, for keyboard users only. */
  :focus-visible { @apply outline-none ring-2 ring-accent-ring ring-offset-1; }
}
```

In `packages/editor/src/main.tsx`, add the font import directly above `import "./styles.css";`:

```tsx
import "@fontsource-variable/inter";
```

Create `packages/editor/src/ui/Button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-100",
  ghost: "text-stone-700 hover:bg-stone-100",
  danger: "bg-danger text-white hover:bg-red-800",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/**
 * Every button in the app. It forwards its ref so a Radix trigger can wrap it,
 * and defaults to type="button" so one inside a form never submits by accident.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});
```

Create `packages/editor/src/ui/Kbd.tsx`:

```tsx
/** A key, drawn as a key, so shortcuts can be learned from the screen. */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-b-2 border-stone-300 bg-white px-1 font-mono text-xs text-stone-600">
      {children}
    </kbd>
  );
}
```

Create `packages/editor/src/ui/Chip.tsx`:

```tsx
import type { ReactNode } from "react";

/** A toggle that reads as a filter: pressed or not, with an optional count. */
export function Chip({
  selected = false,
  count,
  onClick,
  children,
}: {
  selected?: boolean;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium ${
        selected
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={selected ? "text-stone-300" : "text-stone-500"}>{count}</span>
      )}
    </button>
  );
}
```

Create `packages/editor/src/ui/Avatar.tsx`:

```tsx
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
```

Create `packages/editor/src/ui/Progress.tsx`:

```tsx
const FILL = { accent: "bg-accent", proposed: "bg-proposed", confirmed: "bg-confirmed" } as const;

/** A thin bar that carries its numbers for assistive tech, not just its colour. */
export function Progress({
  value,
  max,
  label,
  tone = "accent",
}: {
  value: number;
  max: number;
  label: string;
  tone?: keyof typeof FILL;
}) {
  const now = Math.min(value, max);
  const pct = max > 0 ? Math.round((now / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className="h-1.5 overflow-hidden rounded-full bg-stone-200"
    >
      <div className={`h-full ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
```

Create `packages/editor/src/ui/YoursTag.tsx`:

```tsx
/** Marks what is yours. Amber, and a word, so it does not rely on colour alone. */
export function YoursTag() {
  return (
    <span className="rounded-full bg-yours-soft px-2 py-0.5 text-xs font-semibold text-yours">Yours</span>
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui/primitives.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, 9 tests.
Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json packages/editor/package.json packages/editor/tailwind.config.ts packages/editor/src/styles.css packages/editor/src/main.tsx packages/editor/src/ui/Button.tsx packages/editor/src/ui/Kbd.tsx packages/editor/src/ui/Chip.tsx packages/editor/src/ui/Avatar.tsx packages/editor/src/ui/Progress.tsx packages/editor/src/ui/YoursTag.tsx packages/editor/src/ui/primitives.test.tsx
git commit -m "feat(editor): the look — tokens, Inter, a focus ring, and the small ui pieces

Warm greys, one teal accent and a colour per meaning (yours, proposed,
confirmed, danger) as Tailwind names, so no component carries raw hex.
Text is one step larger than Tailwind's default, with 13 px the
smallest anywhere, and every control gets a visible keyboard focus ring.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dialog, Popover and toasts on Radix

**Files:**
- Modify: `packages/editor/package.json`, `packages/editor/src/testing/setup.ts`
- Create: `packages/editor/src/ui/Dialog.tsx`, `packages/editor/src/ui/Popover.tsx`, `packages/editor/src/ui/toast.ts`, `packages/editor/src/ui/Toaster.tsx`
- Test: `packages/editor/src/ui/overlays.test.tsx`

**Interfaces:**
- Produces: `Dialog({ open, onOpenChange, title, description?, children })`; `Popover({ trigger, children, align?, open?, onOpenChange? })` and `PopoverClose` (Radix `Close`, use with `asChild`); `toast(input: ToastInput): string`, `useToasts` (zustand: `toasts`, `push`, `dismiss`, `clear`), types `Toast`, `ToastInput`, `ToastTone = "info" | "success" | "error"`, `ToastAction = { label: string; run: () => void | Promise<void> }`; `Toaster()`.

- [ ] **Step 1: Install the three Radix packages**

Run: `npm install @radix-ui/react-dialog@^1.1 @radix-ui/react-popover@^1.1 @radix-ui/react-toast@^1.2 --workspace @oth/editor --no-audit --no-fund`
Expected: packages added; `packages/editor/package.json` lists all three.

- [ ] **Step 2: Give jsdom the ResizeObserver Radix needs**

Append to `packages/editor/src/testing/setup.ts`:

```ts
// Radix positions popovers with a ResizeObserver, which jsdom does not have.
// A test that needs real measurements stubs its own with vi.stubGlobal.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/editor/src/ui/overlays.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Popover } from "./Popover";
import { toast, useToasts } from "./toast";
import { Toaster } from "./Toaster";

beforeEach(() => useToasts.getState().clear());

describe("toast", () => {
  it("lets a plain message go on its own", () => {
    toast({ message: "Saved." });
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Saved.", tone: "info", durationMs: 4000 });
  });

  it("keeps an error until it is dismissed, since one that vanishes goes unseen", () => {
    toast({ message: "Could not save.", tone: "error" });
    expect(useToasts.getState().toasts[0]!.durationMs).toBeNull();
  });

  it("keeps an Undo long enough to reach for it", () => {
    toast({ message: "Deleted Stadium", action: { label: "Undo", run: () => {} } });
    expect(useToasts.getState().toasts[0]!.durationMs).toBe(8000);
  });

  it("shows at most four at once", () => {
    for (let i = 0; i < 6; i++) toast({ message: `m${i}` });
    expect(useToasts.getState().toasts.map(t => t.message)).toEqual(["m2", "m3", "m4", "m5"]);
  });
});

describe("Toaster", () => {
  it("shows a toast and runs its action, which also dismisses it", async () => {
    const run = vi.fn();
    render(<Toaster />);
    act(() => { toast({ message: "Deleted Stadium", action: { label: "Undo", run } }); });
    expect(await screen.findByText("Deleted Stadium")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(0));
  });
});

describe("Dialog", () => {
  it("shows its title and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<Dialog open onOpenChange={onOpenChange} title="Change password"><p>body</p></Dialog>);
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("Popover", () => {
  it("opens from its trigger", async () => {
    render(<Popover trigger={<Button>Floors</Button>}><p>L1 L2 L3</p></Popover>);
    expect(screen.queryByText("L1 L2 L3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Floors" }));
    expect(await screen.findByText("L1 L2 L3")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run packages/editor/src/ui/overlays.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `Failed to resolve import "./Dialog"`.

- [ ] **Step 5: Write the four files**

Create `packages/editor/src/ui/toast.ts`:

```ts
import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";
export type ToastAction = { label: string; run: () => void | Promise<void> };
export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Null: stays until dismissed. */
  durationMs: number | null;
};
export type ToastInput = {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number | null;
};

type ToastState = {
  toasts: Toast[];
  push: (t: Toast) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

/** Four at most: a fifth pushes the oldest out rather than stacking up the screen. */
export const useToasts = create<ToastState>(set => ({
  toasts: [],
  push: t => set(s => ({ toasts: [...s.toasts.filter(x => x.id !== t.id), t].slice(-4) })),
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

let seq = 0;

/**
 * Says what just happened, where the status bar used to.
 *
 * Errors stay until dismissed — a failure that disappears on its own is one
 * nobody saw — and anything carrying an Undo stays long enough to reach for it.
 */
export function toast(input: ToastInput): string {
  const id = `toast-${++seq}`;
  const tone = input.tone ?? "info";
  const durationMs =
    input.durationMs !== undefined
      ? input.durationMs
      : tone === "error" ? null : input.action ? 8000 : 4000;
  useToasts.getState().push({ id, message: input.message, tone, action: input.action, durationMs });
  return id;
}
```

Create `packages/editor/src/ui/Toaster.tsx`:

```tsx
import * as T from "@radix-ui/react-toast";
import { useToasts } from "./toast";

const EDGE = { info: "border-stone-300", success: "border-confirmed", error: "border-danger" } as const;

/**
 * Where every toast appears. Radix supplies the live region, so each message is
 * announced, and the swipe-to-dismiss.
 */
export function Toaster() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);

  return (
    <T.Provider swipeDirection="right">
      {toasts.map(t => (
        <T.Root
          key={t.id}
          data-testid={`toast-${t.tone}`}
          // Radix reads Infinity as "until dismissed".
          duration={t.durationMs ?? Infinity}
          onOpenChange={open => {
            if (!open) dismiss(t.id);
          }}
          className={`flex items-start gap-3 rounded border-l-4 bg-white p-3 text-sm shadow-lg ${EDGE[t.tone]}`}
        >
          <T.Description className="flex-1">{t.message}</T.Description>
          {t.action && (
            <T.Action altText={t.action.label} asChild>
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => void t.action!.run()}
              >
                {t.action.label}
              </button>
            </T.Action>
          )}
          <T.Close aria-label="Dismiss" className="text-stone-400 hover:text-stone-700">
            ×
          </T.Close>
        </T.Root>
      ))}
      <T.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </T.Provider>
  );
}
```

Create `packages/editor/src/ui/Dialog.tsx`:

```tsx
import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/** A modal with a title, focus held inside, Escape to close. Radix does the hard parts. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-stone-900/40" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-xs text-stone-500">{description}</D.Description>
          ) : (
            // Radix wants a description; a screen reader gets the title again.
            <D.Description className="sr-only">{title}</D.Description>
          )}
          <div className="mt-4">{children}</div>
          <D.Close aria-label="Close" className="absolute right-3 top-3 text-stone-400 hover:text-stone-700">
            ×
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
```

Create `packages/editor/src/ui/Popover.tsx`:

```tsx
import * as P from "@radix-ui/react-popover";
import type { ReactNode } from "react";

/** Wrap an item in this (asChild) to close the popover when it is chosen. */
export const PopoverClose = P.Close;

/**
 * A panel anchored to its trigger. The trigger must be a single element that
 * takes a ref — a Button, or a plain button or anchor.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-56 rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-lg outline-none"
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui/ --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, both files.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json packages/editor/package.json packages/editor/src/testing/setup.ts packages/editor/src/ui/Dialog.tsx packages/editor/src/ui/Popover.tsx packages/editor/src/ui/toast.ts packages/editor/src/ui/Toaster.tsx packages/editor/src/ui/overlays.test.tsx
git commit -m "feat(editor): dialogs, popovers and toasts, on Radix

The three widgets that are hard to get right by hand — focus held in a
modal, a popover anchored to its trigger, a live region that announces
each message — come from Radix primitives, styled with the app's own
tokens. Errors stay until dismissed; anything with Undo stays 8 s.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Routes — every screen worth sharing is a link

**Files:**
- Modify: `packages/editor/src/route.ts`
- Test: `packages/editor/src/route.test.tsx` (append)

**Interfaces:**
- Produces:
  - `type FloorTab = "survey" | "review" | "build"`, `FLOOR_TABS: readonly FloorTab[]`
  - `type Route = { name: "home" } | { name: "floors" } | { name: "floor"; code: string; tab: FloorTab | null; params: Record<string, string> } | { name: "team" } | { name: "legacy-survey" } | { name: "not-found"; path: string }`
  - `type FloorRoute = Extract<Route, { name: "floor" }>`
  - `parseRoute(pathname: string, search?: string): Route` — floor codes upper-cased; an unknown or missing tab is `null`
  - `href(route: Route): string` — params sorted, empty values dropped
  - `useCurrentRoute(): Route`
  - `navigate(path: string, options?: { replace?: boolean }): void`
  - `setParams(patch: Record<string, string | null>): void` — merge into the current query with `replaceState`
  - `followLink(path: string): (event: React.MouseEvent) => void` — in-app navigation that still lets Ctrl/Cmd/Shift/middle click open a new tab
  - `useRoute()` stays as it is.

- [ ] **Step 1: Write the failing tests**

Append to `packages/editor/src/route.test.tsx` (keep the existing imports; add `fireEvent` to the testing-library import and the new names to the `./route` import so they read):

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { followLink, href, navigate, parseRoute, setParams, useCurrentRoute, useRoute } from "./route";
```

and at the end of the file:

```tsx
describe("parseRoute", () => {
  it("reads the floors home", () => {
    expect(parseRoute("/floors")).toEqual({ name: "floors" });
  });

  it("reads a floor tab with its parameters", () => {
    expect(parseRoute("/floors/L1/survey", "?frame=212&view=grid")).toEqual({
      name: "floor", code: "L1", tab: "survey", params: { frame: "212", view: "grid" },
    });
  });

  it("forgives a lowercase floor code typed by hand", () => {
    expect(parseRoute("/floors/l1/build")).toMatchObject({ code: "L1", tab: "build" });
  });

  it("leaves the tab to be chosen when there is none, or it is not a tab", () => {
    expect(parseRoute("/floors/L1")).toMatchObject({ code: "L1", tab: null });
    expect(parseRoute("/floors/L1/bogus")).toMatchObject({ code: "L1", tab: null });
  });

  it("reads the team page, the old survey link and the root", () => {
    expect(parseRoute("/team")).toEqual({ name: "team" });
    expect(parseRoute("/survey")).toEqual({ name: "legacy-survey" });
    expect(parseRoute("/")).toEqual({ name: "home" });
  });

  it("calls anything else not found, rather than guessing", () => {
    expect(parseRoute("/nope/x")).toEqual({ name: "not-found", path: "/nope/x" });
  });
});

describe("href", () => {
  it("round-trips a floor route", () => {
    const r = parseRoute("/floors/L2/review", "?place=pl_1");
    expect(href(r)).toBe("/floors/L2/review?place=pl_1");
  });

  it("writes parameters in a stable order and drops empty ones", () => {
    expect(href({ name: "floor", code: "L1", tab: "survey", params: { view: "grid", frame: "3", filter: "" } }))
      .toBe("/floors/L1/survey?frame=3&view=grid");
  });

  it("writes a floor with no tab without a trailing slash", () => {
    expect(href({ name: "floor", code: "L1", tab: null, params: {} })).toBe("/floors/L1");
  });
});

function RouteProbe() {
  const r = useCurrentRoute();
  return <span data-testid="current">{JSON.stringify(r)}</span>;
}

describe("useCurrentRoute and friends", () => {
  it("follows navigation, query included", () => {
    render(<RouteProbe />);
    act(() => navigate("/floors/L1/survey?frame=5"));
    expect(JSON.parse(screen.getByTestId("current").textContent!)).toMatchObject({ tab: "survey", params: { frame: "5" } });
  });

  it("replaces rather than pushes when asked, so Back skips a redirect", () => {
    const before = window.history.length;
    act(() => navigate("/floors", { replace: true }));
    expect(window.history.length).toBe(before);
    expect(window.location.pathname).toBe("/floors");
  });

  it("merges parameters into the current address and removes the ones set to null", () => {
    render(<RouteProbe />);
    act(() => navigate("/floors/L1/survey?frame=5&view=grid"));
    act(() => setParams({ frame: "6", view: null }));
    expect(window.location.search).toBe("?frame=6");
    expect(JSON.parse(screen.getByTestId("current").textContent!).params).toEqual({ frame: "6" });
  });

  it("leaves a Ctrl-click to the browser, so it can open a new tab", () => {
    // Called directly: a real Ctrl-click in jsdom would attempt a navigation
    // jsdom does not implement.
    const preventDefault = vi.fn();
    followLink("/team")({ button: 0, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault } as never);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toBe("/team");
  });

  it("navigates in place on a plain click", () => {
    render(<a href="/team" onClick={followLink("/team")}>Team</a>);
    fireEvent.click(screen.getByText("Team"));
    expect(window.location.pathname).toBe("/team");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/route.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `parseRoute` is not exported.

- [ ] **Step 3: Implement**

Replace `packages/editor/src/route.ts` with:

```ts
import { useMemo, useSyncExternalStore, type MouseEvent } from "react";

/**
 * A handful of routes do not need a router.
 *
 * The server serves index.html for any non-API path and Vite does the same in
 * development, so real paths work. This is the few dozen lines that would
 * otherwise be a dependency — and a pure parse and build, so what a URL means
 * is tested rather than discovered.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

function notify(): void {
  // pushState and replaceState do not fire popstate, so subscribers are told directly.
  for (const fn of [...listeners]) fn();
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    // Server-rendered snapshot; the editor never renders on a server, but
    // useSyncExternalStore insists and a wrong guess here would hydrate wrong.
    () => "/",
  );
}

export type FloorTab = "survey" | "review" | "build";
export const FLOOR_TABS: readonly FloorTab[] = ["survey", "review", "build"];

export type Route =
  | { name: "home" }
  | { name: "floors" }
  | { name: "floor"; code: string; tab: FloorTab | null; params: Record<string, string> }
  | { name: "team" }
  | { name: "legacy-survey" }
  | { name: "not-found"; path: string };

export type FloorRoute = Extract<Route, { name: "floor" }>;

/**
 * What a URL means. Floor codes are upper-cased, since "l1" typed by hand means
 * L1; a missing or unknown tab is null, for the workspace to choose.
 */
export function parseRoute(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter(Boolean).map(p => decodeURIComponent(p));
  if (parts.length === 0) return { name: "home" };
  if (parts.length === 1 && parts[0] === "survey") return { name: "legacy-survey" };
  if (parts.length === 1 && parts[0] === "team") return { name: "team" };
  if (parts[0] === "floors") {
    if (parts.length === 1) return { name: "floors" };
    if (parts.length <= 3) {
      const tab = (FLOOR_TABS as readonly string[]).includes(parts[2] ?? "")
        ? (parts[2] as FloorTab)
        : null;
      const params = Object.fromEntries(new URLSearchParams(search).entries());
      return { name: "floor", code: parts[1]!.toUpperCase(), tab, params };
    }
  }
  return { name: "not-found", path: pathname };
}

function query(params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
}

/** The URL for a route. Parameters are sorted, so the same place is always the same link. */
export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "/";
    case "floors":
      return "/floors";
    case "team":
      return "/team";
    case "legacy-survey":
      return "/survey";
    case "not-found":
      return route.path;
    case "floor":
      return `/floors/${encodeURIComponent(route.code)}${route.tab ? `/${route.tab}` : ""}${query(route.params)}`;
  }
}

function currentLocation(): string {
  return window.location.pathname + window.location.search;
}

/** The current route, re-rendering when the path or the query changes. */
export function useCurrentRoute(): Route {
  const loc = useSyncExternalStore(subscribe, currentLocation, () => "/");
  return useMemo(() => {
    const i = loc.indexOf("?");
    return i < 0 ? parseRoute(loc) : parseRoute(loc.slice(0, i), loc.slice(i));
  }, [loc]);
}

/**
 * Goes somewhere in the app. `replace` is for redirects, so Back does not land
 * on a page that immediately sends you forward again.
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  notify();
}

/**
 * Changes query parameters on the current page without adding history — moving
 * to the next frame is not somewhere Back should step through one by one.
 */
export function setParams(patch: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
  window.history.replaceState({}, "", window.location.pathname + search);
  notify();
}

/**
 * An onClick for an in-app link. A plain click navigates in place; Ctrl, Cmd,
 * Shift or a middle click are left to the browser, so "open in a new tab" works.
 */
export function followLink(path: string): (event: MouseEvent) => void {
  return event => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/route.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS (the three existing routing tests and the new ones).
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/route.ts packages/editor/src/route.test.tsx
git commit -m "feat(editor): every screen worth sharing is a link

parseRoute and href turn /floors/L1/survey?frame=212 into a typed route
and back, so \"look at frame 212\" can be sent to a teammate. Floor codes
typed in lowercase still work; a missing tab is left for the workspace
to choose. setParams changes the query without piling up history, and
followLink keeps Ctrl-click opening a new tab.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Model — floor owners, and the floor a place is on

**Files:**
- Modify: `packages/model/src/schema/building.ts` (LevelSchema), `packages/model/src/bundle/build.ts:44-50`, `packages/model/src/index.ts`
- Create: `packages/model/src/survey/levels.ts`
- Test: `packages/model/src/schema/building.test.ts` (append), `packages/model/src/survey/levels.test.ts` (create), `packages/model/src/bundle/build.test.ts` (append)

**Interfaces:**
- Produces: `Level.ownerIds: string[]` (default `[]`); `placeLevels(model: MapModel): Map<string, string | undefined>`; `placeLevel(model: MapModel, place: Place): string | undefined`. Both exported from `@oth/model`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/model/src/schema/building.test.ts` (it already imports `describe`, `expect`, `it`; add `LevelSchema` to its schema import if absent):

```ts
describe("level owners", () => {
  const level = {
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6,
  };

  it("has no owners until someone is assigned", () => {
    expect(LevelSchema.parse(level).ownerIds).toEqual([]);
  });

  it("keeps the owners it is given", () => {
    expect(LevelSchema.parse({ ...level, ownerIds: ["user_a", "user_b"] }).ownerIds).toEqual(["user_a", "user_b"]);
  });
});
```

Create `packages/model/src/survey/levels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { placeLevel, placeLevels } from "./levels";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
];
const captures = [
  { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
  { id: "cap_2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
  { id: "cap_x", kind: "video", filename: "unfiled.mp4" },
];
const frame = (id: string, captureId: string) =>
  ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480 });
const keyframes = [frame("kf_1", "cap_1"), frame("kf_2", "cap_1"), frame("kf_3", "cap_2"), frame("kf_4", "cap_2"), frame("kf_x", "cap_x")];
const place = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, nameEn: id, category: "retail", ...extra });
const seen = (id: string, placeId: string, keyframeId: string, extra: Record<string, unknown> = {}) =>
  ({ id, placeId, keyframeId, ...extra });

function model(places: unknown[], sightings: unknown[]) {
  return parseModel({ building, levels, captures, keyframes, places, sightings });
}

describe("placeLevel", () => {
  it("uses the place's own level when it has one", () => {
    const m = model([place("p", { levelId: "oth-L2" })], [seen("s", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L2");
  });

  it("otherwise takes the level of the footage it was seen in", () => {
    const m = model([place("p")], [seen("s", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });

  it("goes with the level it was seen on most", () => {
    const m = model([place("p")], [seen("a", "p", "kf_1"), seen("b", "p", "kf_3"), seen("c", "p", "kf_4")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L2");
  });

  it("breaks a tie toward the lower floor, so the answer is the same on every reload", () => {
    const m = model([place("p")], [seen("a", "p", "kf_3"), seen("b", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });

  it("has no level when nothing says where it is", () => {
    const m = model([place("p")], [seen("a", "p", "kf_x")]);
    expect(placeLevel(m, m.places[0]!)).toBeUndefined();
  });

  it("ignores a deleted sighting", () => {
    const m = model([place("p")], [seen("a", "p", "kf_3", { deletedAt: "2026-09-27T00:00:00.000Z" }), seen("b", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });
});

describe("placeLevels", () => {
  it("answers for every place at once", () => {
    const m = model([place("p1"), place("p2", { levelId: "oth-L2" })], [seen("a", "p1", "kf_1")]);
    expect(placeLevels(m)).toEqual(new Map([["p1", "oth-L1"], ["p2", "oth-L2"]]));
  });
});
```

Append to `packages/model/src/bundle/build.test.ts` (it already has a model fixture and `buildBundle`; this test builds its own model so it does not depend on that fixture's shape):

```ts
describe("owners are never published", () => {
  it("leaves level owners out of the public bundle", () => {
    const owned = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{
        id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼",
        elevationM: 0, heightM: 6, ownerIds: ["user_secret"],
      }],
    });
    const files = buildBundle(owned, { version: "v1", createdAt: "2026-09-27T00:00:00.000Z", createdBy: "t" });
    expect(files.map(f => f.contents).join("\n")).not.toContain("user_secret");
  });
});
```

(`buildBundle(model: MapModel, meta: BundleMeta): BundleFile[]`, where `BundleMeta = { version; createdAt; createdBy; notes? }` and `BundleFile = { path; contents }`. If `build.test.ts` does not yet import `parseModel`, it does: `import { parseModel } from "../schema/model";`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/model/src/schema/building.test.ts packages/model/src/survey/levels.test.ts packages/model/src/bundle/build.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `ownerIds` is undefined; `./levels` does not resolve; `user_secret` is found in the bundle.

- [ ] **Step 3: Implement**

In `packages/model/src/schema/building.ts`, add to `LevelSchema`'s object, after `heightM`:

```ts
  /**
   * Who owns this floor's survey and build work. User ids, not names, so a
   * rename does not orphan a floor. Editing-only: never published.
   */
  ownerIds: z.array(z.string().min(1)).default([]),
```

Create `packages/model/src/survey/levels.ts`:

```ts
import { live } from "../primitives";
import type { MapModel } from "../schema/model";
import type { Place } from "../schema/survey";

/**
 * The floor each place is on.
 *
 * A place's own levelId when it has one. Otherwise the floor of the footage it
 * was seen in: most of the survey was labelled before places carried a level,
 * and the frames already know where they were filmed. When its sightings
 * disagree, the floor it was seen on most wins; a tie goes to the lower floor,
 * so the answer does not change between reloads.
 */
export function placeLevels(model: MapModel): Map<string, string | undefined> {
  const captureLevel = new Map(live(model.captures).map(c => [c.id, c.levelId]));
  const frameLevel = new Map(live(model.keyframes).map(k => [k.id, captureLevel.get(k.captureId)]));
  const ordinal = new Map(model.levels.map(l => [l.id, l.ordinal]));

  const counts = new Map<string, Map<string, number>>();
  for (const s of live(model.sightings)) {
    const level = frameLevel.get(s.keyframeId);
    if (!level) continue;
    const perPlace = counts.get(s.placeId) ?? new Map<string, number>();
    perPlace.set(level, (perPlace.get(level) ?? 0) + 1);
    counts.set(s.placeId, perPlace);
  }

  const result = new Map<string, string | undefined>();
  for (const place of live(model.places)) {
    if (place.levelId) {
      result.set(place.id, place.levelId);
      continue;
    }
    const best = [...(counts.get(place.id) ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || (ordinal.get(a[0]) ?? 0) - (ordinal.get(b[0]) ?? 0))[0];
    result.set(place.id, best?.[0]);
  }
  return result;
}

/** One place's floor. For many places, placeLevels answers them all in one pass. */
export function placeLevel(model: MapModel, place: Place): string | undefined {
  return placeLevels(model).get(place.id) ?? place.levelId;
}
```

In `packages/model/src/index.ts`, after `export * from "./survey/graph";`, add:

```ts
export * from "./survey/levels";
```

In `packages/model/src/bundle/build.ts`, find where `levels` is computed (`const levels = byId(live(model.levels));`) and strip the owners where the building file is written. Replace the `contents: stableStringify({ building: model.building, levels }),` line with:

```ts
    // Owners are who does the editing — nothing a visitor needs, and user ids
    // have no business in a public file.
    contents: stableStringify({
      building: model.building,
      levels: levels.map(({ ownerIds: _owners, ...rest }) => rest),
    }),
```

- [ ] **Step 4: Run the model tests and the typecheck**

Run: `npx vitest run packages/model/src --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, every model test file (the bundle determinism tests included — the bundle for existing models is byte-identical, since owners default to empty and are stripped).
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/schema/building.ts packages/model/src/schema/building.test.ts packages/model/src/survey/levels.ts packages/model/src/survey/levels.test.ts packages/model/src/bundle/build.ts packages/model/src/bundle/build.test.ts packages/model/src/index.ts
git commit -m "feat(model): floors have owners, and every place has a floor

Levels carry ownerIds, the people whose floor it is; they are editing
data and are stripped from the published bundle. placeLevels gives each
place its floor: its own levelId, or else the floor of the footage it
was seen in most — which is how the 177 places labelled before places
carried a level get one without a data migration.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Server — owner and password columns; the session says when a password must change

**Files:**
- Modify: `packages/server/src/db/schema.ts` (levels, users), `packages/server/src/auth/users.ts`, `packages/server/src/auth/sessions.ts:18-29`, `packages/server/src/auth/routes.ts:34`, `packages/server/src/cli/invite.ts`
- Create: `packages/server/drizzle/0010_*.sql` and its meta files (generated)
- Test: `packages/server/src/entities/routes.test.ts` (append), `packages/server/src/auth/routes.test.ts` (append), `packages/server/src/cli/invite.test.ts` (append)

**Interfaces:**
- Consumes: `Level.ownerIds` (Task 4).
- Produces: `levels.owner_ids jsonb not null default []`; `users.must_change_password boolean not null default false`; `User.mustChangePassword: boolean` (on `c.get("user")`, `/api/auth/me`, and the login response); `createUser(db, { email, password, displayName, invitedBy?, mustChangePassword? })`; `inviteUser(db, email, displayName, invitedBy?)` and `resetPassword(db, email)` both set `mustChangePassword: true`.

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of `packages/server/src/entities/routes.test.ts`. The file has module-level `app`, `db` and a signed-in `cookie`, and its `beforeEach` seeds building `oth` and level `oth-L1`:

```ts
describe("level owners", () => {
  it("saves and returns a floor's owners", async () => {
    await app.request("/api/entities/level", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ data: {
        id: "oth-L9", buildingId: "oth", code: "L9", ordinal: 9,
        nameEn: "L9", nameZh: "九楼", elevationM: 40, heightM: 4,
      } }),
    });
    const res = await app.request("/api/entities/level/oth-L9", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0, data: { ownerIds: ["user_a"] } }),
    });
    expect(res.status).toBe(200);
    const list = await (await app.request("/api/entities/level", { headers: { cookie } })).json() as {
      items: { id: string; ownerIds: string[] }[];
    };
    expect(list.items.find(l => l.id === "oth-L9")?.ownerIds).toEqual(["user_a"]);
  });
});
```

Append to `packages/server/src/auth/routes.test.ts`, inside its `describe("auth routes", …)` (it already imports `eq` and `users`):

```ts
  it("says in the session when the password is a one-time one", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    const me = await (await app.request("/api/auth/me", { headers: { cookie } })).json() as {
      user: { mustChangePassword: boolean };
    };
    expect(me.user.mustChangePassword).toBe(false);

    await db.update(users).set({ mustChangePassword: true }).where(eq(users.email, "wei@example.com"));
    const again = await (await app.request("/api/auth/me", { headers: { cookie } })).json() as {
      user: { mustChangePassword: boolean };
    };
    expect(again.user.mustChangePassword).toBe(true);
  });
```

Append to `packages/server/src/cli/invite.test.ts`, as a new `describe` at the end. Its tests make their own database each (`const db = await createTestDb()`); add `import { eq } from "drizzle-orm";` and `import { users } from "../db/schema";` to its imports:

```ts
describe("one-time passwords", () => {
  it("asks an invited person to set their own password", async () => {
    const db = await createTestDb();
    const { user } = await inviteUser(db, "new@example.com", "New Person");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.mustChangePassword).toBe(true);
  });

  it("asks again after a reset", async () => {
    const db = await createTestDb();
    const { user } = await inviteUser(db, "again@example.com", "Again");
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
    await resetPassword(db, "again@example.com");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.mustChangePassword).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/entities/routes.test.ts packages/server/src/auth/routes.test.ts packages/server/src/cli/invite.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — TypeScript/Drizzle has no `mustChangePassword` column; `ownerIds` comes back undefined.

- [ ] **Step 3: Add the columns and generate the migration**

In `packages/server/src/db/schema.ts`, in the `users` table, after `disabledAt`:

```ts
  /** Set when an invite or reset issues a one-time password; cleared when its owner sets one. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
```

In the `levels` table, after `heightM`:

```ts
  ownerIds: jsonb("owner_ids").$type<string[]>().notNull().default([]),
```

Run: `cd packages/server && npx drizzle-kit generate && cd ../..`
Expected: a new `packages/server/drizzle/0010_<name>.sql` containing exactly these two statements (order may differ):

```sql
ALTER TABLE "levels" ADD COLUMN "owner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
```

plus an updated `drizzle/meta/_journal.json` and a new `drizzle/meta/0010_snapshot.json`. If the SQL holds anything else, stop: the schema and the last snapshot disagree, and that must be understood before going on.

- [ ] **Step 4: Carry the flag through the auth code**

In `packages/server/src/auth/users.ts`, replace the `User` and `CreateUserInput` types and `createUser`:

```ts
export type User = {
  id: string;
  email: string;
  displayName: string;
  /** True while the account is on a one-time password from an invite or reset. */
  mustChangePassword: boolean;
};

export type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  invitedBy?: string;
  mustChangePassword?: boolean;
};

/** Invite-only: there is no self-service signup route anywhere in this server. */
export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  const id = `user_${randomUUID()}`;
  const email = input.email.toLowerCase().trim();
  const mustChangePassword = input.mustChangePassword ?? false;
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    invitedBy: input.invitedBy ?? null,
    mustChangePassword,
  });
  return { id, email, displayName: input.displayName, mustChangePassword };
}
```

In `packages/server/src/auth/sessions.ts`, replace the last line of `resolveSession`:

```ts
  return {
    id: row.user.id,
    email: row.user.email,
    displayName: row.user.displayName,
    mustChangePassword: row.user.mustChangePassword,
  };
```

In `packages/server/src/auth/routes.ts`, replace the login's final `return`:

```ts
  return c.json({
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      mustChangePassword: row.mustChangePassword,
    },
  });
```

In `packages/server/src/cli/invite.ts`, replace `inviteUser` and the tail of `resetPassword`:

```ts
export async function inviteUser(
  db: Database, email: string, displayName: string, invitedBy?: string,
): Promise<{ user: User; password: string }> {
  if (await findUserByEmail(db, email)) {
    throw new Error(`a user with email ${email} already exists`);
  }
  const password = oneTimePassword();
  // A one-time password is meant to be replaced; the app asks until it is.
  const user = await createUser(db, { email, password, displayName, invitedBy, mustChangePassword: true });
  return { user, password };
}
```

and in `resetPassword`:

```ts
  const password = oneTimePassword();
  await db.update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(users.id, existing.id));

  return {
    user: {
      id: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      mustChangePassword: true,
    },
    password,
  };
```

- [ ] **Step 5: Run the server tests touched and the typecheck**

Run: `npx vitest run packages/server/src/entities packages/server/src/auth packages/server/src/cli/invite.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0. Any other file constructing a `User` literal fails here — add `mustChangePassword: false` to it.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/drizzle packages/server/src/auth/users.ts packages/server/src/auth/sessions.ts packages/server/src/auth/routes.ts packages/server/src/auth/routes.test.ts packages/server/src/cli/invite.ts packages/server/src/cli/invite.test.ts packages/server/src/entities/routes.test.ts
git commit -m "feat(server): floor owners, and a flag for one-time passwords

levels.owner_ids stores who owns a floor, through the ordinary entity
API. users.must_change_password is set by an invite or a reset and
travels with the session, so the app can ask someone on a one-time
password to set their own until they do.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Server — the team from the app, changing your password, the last publish

**Files:**
- Create: `packages/server/src/users/routes.ts`
- Modify: `packages/server/src/auth/routes.ts`, `packages/server/src/publish/routes.ts`, `packages/server/src/app.ts`
- Test: `packages/server/src/users/routes.test.ts` (create), `packages/server/src/auth/routes.test.ts` (append)

**Interfaces:**
- Consumes: `inviteUser(db, email, displayName, invitedBy?)`, `resetPassword(db, email)` (Task 5).
- Produces:
  - `GET /api/users` → `{ users: { id, email, displayName }[] }` (disabled accounts omitted)
  - `POST /api/users/invite` `{ email, displayName }` → `201 { user: { id, email, displayName }, password }`; `409` if the email is taken; `400` for a bad body
  - `POST /api/users/:id/reset-password` → `{ user, password }`; `404` for an unknown or disabled id
  - `POST /api/auth/password` `{ currentPassword, newPassword }` → `204`; `422` for a wrong current password; `400` for a new password under 10 characters
  - `GET /api/publish/latest` → `{ latest: { version, createdAt, warningCount } | null }`
  - An `audit_log` row (`entityType: "user"`, `action: "invite"` / `"reset-password"`) per invite and reset

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/users/routes.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const post = (path: string, body: unknown, headers: Record<string, string> = { cookie }) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function login(email: string, password: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, { email: "wei@example.com", password: "passphrase-1", displayName: "Wei" });
  cookie = (await login("wei@example.com", "passphrase-1")).headers.get("set-cookie") ?? "";
});

describe("the team", () => {
  it("lists everyone on it, without anyone's password hash", async () => {
    const body = await json<{ users: Record<string, unknown>[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users).toEqual([{ id: expect.any(String), email: "wei@example.com", displayName: "Wei" }]);
  });

  it("leaves out a disabled account", async () => {
    const ghost = await createUser(db, { email: "ghost@example.com", password: "x".repeat(12), displayName: "Ghost" });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, ghost.id));
    const body = await json<{ users: { email: string }[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users.map(u => u.email)).toEqual(["wei@example.com"]);
  });

  it("requires a signed-in teammate", async () => {
    expect((await app.request("/api/users")).status).toBe(401);
  });
});

describe("inviting", () => {
  it("creates the account and hands back its one-time password, once", async () => {
    const res = await post("/api/users/invite", { email: "Aisha@Example.com", displayName: "Aisha" });
    expect(res.status).toBe(201);
    const body = await json<{ user: { email: string }; password: string }>(res);
    expect(body.user.email).toBe("aisha@example.com");
    const signIn = await login("aisha@example.com", body.password);
    expect(signIn.status).toBe(200);
    expect((await json<{ user: { mustChangePassword: boolean } }>(signIn)).user.mustChangePassword).toBe(true);
  });

  it("refuses an email already on the team", async () => {
    expect((await post("/api/users/invite", { email: "wei@example.com", displayName: "Wei again" })).status).toBe(409);
  });

  it("refuses a body that is not an invite", async () => {
    expect((await post("/api/users/invite", { email: "not-an-email", displayName: "" })).status).toBe(400);
  });

  it("records who invited whom", async () => {
    await post("/api/users/invite", { email: "aisha@example.com", displayName: "Aisha" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "invite"));
    expect(rows).toHaveLength(1);
  });
});

describe("resetting a password", () => {
  it("issues a new one-time password and retires the old one", async () => {
    const invited = await json<{ user: { id: string }; password: string }>(
      await post("/api/users/invite", { email: "aisha@example.com", displayName: "Aisha" }),
    );
    const res = await post(`/api/users/${invited.user.id}/reset-password`, {});
    expect(res.status).toBe(200);
    const fresh = await json<{ password: string }>(res);
    expect(fresh.password).not.toBe(invited.password);
    expect((await login("aisha@example.com", invited.password)).status).toBe(401);
    expect((await login("aisha@example.com", fresh.password)).status).toBe(200);
  });

  it("is written to the audit log", async () => {
    const me = await json<{ user: { id: string } }>(await app.request("/api/auth/me", { headers: { cookie } }));
    await post(`/api/users/${me.user.id}/reset-password`, {});
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "reset-password"));
    expect(rows).toHaveLength(1);
  });

  it("404s someone who is not on the team", async () => {
    expect((await post("/api/users/user_nope/reset-password", {})).status).toBe(404);
  });
});

describe("the last publish", () => {
  it("is null before anything has been published", async () => {
    const body = await json<{ latest: unknown }>(await app.request("/api/publish/latest", { headers: { cookie } }));
    expect(body.latest).toBeNull();
  });
});
```

Append to `packages/server/src/auth/routes.test.ts`, inside its `describe`:

```ts
  describe("changing your password", () => {
    async function signedIn() {
      return (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    }
    const change = (cookie: string, body: unknown) => app.request("/api/auth/password", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
    });

    it("sets the new password and clears the one-time flag", async () => {
      const cookie = await signedIn();
      await db.update(users).set({ mustChangePassword: true }).where(eq(users.email, "wei@example.com"));
      const res = await change(cookie, { currentPassword: "a-good-passphrase", newPassword: "another-good-one" });
      expect(res.status).toBe(204);
      expect((await login("wei@example.com", "another-good-one")).status).toBe(200);
      const [row] = await db.select().from(users).where(eq(users.email, "wei@example.com"));
      expect(row!.mustChangePassword).toBe(false);
    });

    it("says the current password is wrong without signing you out", async () => {
      // 422, not 401: a mistyped password must not read as a lost session.
      const cookie = await signedIn();
      const res = await change(cookie, { currentPassword: "nope", newPassword: "another-good-one" });
      expect(res.status).toBe(422);
      expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
    });

    it("refuses a new password under ten characters", async () => {
      const cookie = await signedIn();
      expect((await change(cookie, { currentPassword: "a-good-passphrase", newPassword: "short" })).status).toBe(400);
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/users/routes.test.ts packages/server/src/auth/routes.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `/api/users` and `/api/auth/password` are 404.

- [ ] **Step 3: Implement**

Create `packages/server/src/users/routes.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { findUserByEmail } from "../auth/users";
import { inviteUser, resetPassword } from "../cli/invite";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";

const InviteBody = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(80),
});

async function record(db: Database, actorId: string, userId: string, action: string) {
  await db.insert(auditLog).values({
    id: `audit_${randomUUID()}`,
    entityType: "user",
    entityId: userId,
    action,
    actorId,
  });
}

/**
 * The team, managed from the app rather than from a terminal.
 *
 * A flat team, as the map-model spec decided: anyone signed in may invite a
 * teammate or issue a fresh password. A one-time password is in the response
 * and nowhere else — it is never stored in the clear — and every invite and
 * reset is in the audit log.
 */
export const userRoutes = new Hono<AppEnv>();
userRoutes.use("*", requireUser);

userRoutes.get("/", async c => {
  const rows = await c.get("db").select().from(users).where(isNull(users.disabledAt));
  return c.json({ users: rows.map(u => ({ id: u.id, email: u.email, displayName: u.displayName })) });
});

userRoutes.post("/invite", async c => {
  const body = InviteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { email, displayName }" }, 400);
  const db = c.get("db");
  if (await findUserByEmail(db, body.data.email)) {
    return c.json({ error: "someone with that email is already on the team" }, 409);
  }
  const actor = c.get("user").id;
  const { user, password } = await inviteUser(db, body.data.email, body.data.displayName, actor);
  await record(db, actor, user.id, "invite");
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, password }, 201);
});

userRoutes.post("/:id/reset-password", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(users).where(eq(users.id, c.req.param("id")));
  if (!row || row.disabledAt) return c.json({ error: "not found" }, 404);
  const { user, password } = await resetPassword(db, row.email);
  await record(db, c.get("user").id, user.id, "reset-password");
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, password });
});
```

In `packages/server/src/auth/routes.ts`, add imports (`eq` from `drizzle-orm`; `users` from `../db/schema`; `hashPassword` alongside `verifyPassword` from `./password`) and append:

```ts
const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
});

/**
 * Changing your own password, which also ends the one-time-password prompt.
 * A wrong current password is 422, not 401: it must not read as a lost session.
 */
authRoutes.post("/password", requireUser, async c => {
  const body = PasswordBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "A new password needs at least 10 characters." }, 400);
  const db = c.get("db");
  const me = c.get("user");
  const row = await findUserByEmail(db, me.email);
  if (!row || !(await verifyPassword(body.data.currentPassword, row.passwordHash))) {
    return c.json({ error: "Your current password is not right." }, 422);
  }
  await db.update(users)
    .set({ passwordHash: await hashPassword(body.data.newPassword), mustChangePassword: false })
    .where(eq(users.id, me.id));
  return c.body(null, 204);
});
```

In `packages/server/src/publish/routes.ts`, add imports (`desc` from `drizzle-orm`; `publishedVersions` from `../db/schema`) and add before the `/published/:version/*` route:

```ts
/** The most recent publish, for "last published v12, 3 days ago" on the home page. */
publishRoutes.get("/publish/latest", requireUser, async c => {
  const [row] = await c.get("db").select().from(publishedVersions)
    .orderBy(desc(publishedVersions.createdAt)).limit(1);
  return c.json({
    latest: row
      ? { version: row.id, createdAt: row.createdAt.toISOString(), warningCount: row.warningCount }
      : null,
  });
});
```

In `packages/server/src/app.ts`, import `userRoutes` from `./users/routes` and mount it after the auth routes:

```ts
  app.route("/api/users", userRoutes);
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/server/src/users packages/server/src/auth --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/users packages/server/src/auth/routes.ts packages/server/src/auth/routes.test.ts packages/server/src/publish/routes.ts packages/server/src/app.ts
git commit -m "feat(server): invite a teammate, reset or change a password, from the app

Accounts no longer need a terminal after the first: GET /api/users lists
the team, POST /invite and /:id/reset-password return a one-time password
once, and POST /api/auth/password changes your own. A wrong current
password is 422, so it never reads as a lost session. Invites and resets
are in the audit log. GET /api/publish/latest feeds the home page.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Server — restore, the other half of every Undo

**Files:**
- Modify: `packages/server/src/entities/repository.ts`, `packages/server/src/entities/routes.ts`, `packages/server/src/survey/routes.ts`
- Test: `packages/server/src/entities/routes.test.ts` (append), `packages/server/src/survey/routes.test.ts` (append)

**Interfaces:**
- Produces:
  - `restoreEntity(db, type, id, expectedVersion, actorId): Promise<Row>`; `class NotDeletedError`
  - `POST /api/entities/:type/:id/restore` `{ expectedVersion }` → `{ entity }`; `409 { current }` on a version mismatch; `422` if not deleted; `404` if unknown
  - `POST /api/keyframes/:id/restore` → `{ sightings: number }` — the frame, and only the sightings binned with it; `422` if the frame is live; `404` if unknown

- [ ] **Step 1: Write the failing tests**

Append to the end of `packages/server/src/entities/routes.test.ts` (module-level `app` and `cookie`; level `oth-L1` is seeded). It uses a local helper; paste it with the tests:

```ts
  describe("restore", () => {
    const send = (method: string, path: string, body?: unknown) => app.request(path, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    async function binnedPathway() {
      await send("POST", "/api/entities/pathway", { data: { id: "p_undo", levelId: "oth-L1", polyline: [[0, 0], [5, 0]] } });
      await send("DELETE", "/api/entities/pathway/p_undo", { expectedVersion: 0 });
    }

    it("brings a deleted entity back, one version on", async () => {
      await binnedPathway();
      const res = await send("POST", "/api/entities/pathway/p_undo/restore", { expectedVersion: 1 });
      expect(res.status).toBe(200);
      const list = await (await send("GET", "/api/entities/pathway")).json() as { items: { id: string; version: number }[] };
      expect(list.items.find(p => p.id === "p_undo")?.version).toBe(2);
    });

    it("refuses when someone has touched it since, and says so", async () => {
      await binnedPathway();
      const res = await send("POST", "/api/entities/pathway/p_undo/restore", { expectedVersion: 0 });
      expect(res.status).toBe(409);
    });

    it("refuses to restore something that was never deleted", async () => {
      await send("POST", "/api/entities/pathway", { data: { id: "p_live", levelId: "oth-L1", polyline: [[0, 0], [5, 0]] } });
      expect((await send("POST", "/api/entities/pathway/p_live/restore", { expectedVersion: 0 })).status).toBe(422);
    });

    it("404s something that never existed", async () => {
      expect((await send("POST", "/api/entities/pathway/p_nope/restore", { expectedVersion: 0 })).status).toBe(404);
    });
  });
```

Append to `packages/server/src/survey/routes.test.ts`, inside `describe("keyframe upload", …)`:

```ts
  it("restores a binned frame with the tags binned with it, and not ones removed by hand before", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    const kf = body.keyframe.id;
    await post("/api/entities/place", { data: { id: "pl_r", nameEn: "Somewhere", category: "retail" } });
    await post("/api/entities/sighting", { data: { id: "sg_keep", placeId: "pl_r", keyframeId: kf } });
    await post("/api/entities/sighting", { data: { id: "sg_gone", placeId: "pl_r", keyframeId: kf } });
    // Removed by hand first, so it must stay removed.
    await app.request("/api/entities/sighting/sg_gone", {
      method: "DELETE", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ expectedVersion: 0 }),
    });
    await app.request(`/api/keyframes/${kf}`, { method: "DELETE", headers: { cookie } });

    const res = await app.request(`/api/keyframes/${kf}/restore`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sightings: 1 });

    const frames = await json<{ items: { id: string }[] }>(await app.request("/api/keyframes", { headers: { cookie } }));
    expect(frames.items.map(f => f.id)).toContain(kf);
    const sightings = await json<{ items: { id: string }[] }>(await app.request("/api/entities/sighting", { headers: { cookie } }));
    expect(sightings.items.map(s => s.id)).toEqual(["sg_keep"]);
  });

  it("refuses to restore a frame that is not binned", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    expect((await app.request(`/api/keyframes/${body.keyframe.id}/restore`, { method: "POST", headers: { cookie } })).status).toBe(422);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/entities/routes.test.ts packages/server/src/survey/routes.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — the restore routes are 404.

- [ ] **Step 3: Implement**

In `packages/server/src/entities/repository.ts`, append:

```ts
export class NotDeletedError extends Error {
  constructor() {
    super("not deleted");
    this.name = "NotDeletedError";
  }
}

/**
 * Brings back a soft-deleted entity — the other half of every Undo.
 *
 * Version-checked like any write: if someone has touched it since the delete,
 * the restore is refused with their state, rather than overwriting what they did.
 */
export async function restoreEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
): Promise<Row> {
  const { table } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();
  if (before.deletedAt == null) throw new NotDeletedError();

  const updated = (await db
    .update(table)
    .set({
      deletedAt: null,
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await audit(db, type, id, "restore", actorId, before, after);
  return after;
}
```

In `packages/server/src/entities/routes.ts`, add `NotDeletedError` and `restoreEntity` to the `./repository` import, and append:

```ts
entityRoutes.post("/:type/:id/restore", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  const body = DeleteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  try {
    const entity = await restoreEntity(
      c.get("db"), type, c.req.param("id"), body.data.expectedVersion, c.get("user").id,
    );
    return c.json({ entity });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return c.json({ error: "version conflict", current: err.current }, 409);
    }
    if (err instanceof NotDeletedError) return c.json({ error: "not deleted" }, 422);
    return c.json({ error: "not found" }, 404);
  }
});
```

In `packages/server/src/survey/routes.ts`, append after the keyframe `DELETE` route:

```ts
/**
 * Undoes binning a frame.
 *
 * The frame and its sightings were retired with one timestamp, so that
 * timestamp is how the right sightings come back: a tag removed by hand
 * earlier has an older one, and stays removed.
 */
keyframeRoutes.post("/:id/restore", async c => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [row] = await db.select().from(keyframes).where(eq(keyframes.id, id));
  if (!row) return c.json({ error: "not found" }, 404);
  if (!row.deletedAt) return c.json({ error: "not deleted" }, 422);

  const now = new Date();
  const by = c.get("user").id;
  const restored = await db.update(sightings)
    .set({ deletedAt: null, updatedBy: by, updatedAt: now })
    .where(and(eq(sightings.keyframeId, id), eq(sightings.deletedAt, row.deletedAt)))
    .returning();
  await db.update(keyframes)
    .set({ deletedAt: null, updatedBy: by, updatedAt: now })
    .where(eq(keyframes.id, id));

  return c.json({ sightings: restored.length });
});
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/server/src/entities packages/server/src/survey --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/entities/repository.ts packages/server/src/entities/routes.ts packages/server/src/entities/routes.test.ts packages/server/src/survey/routes.ts packages/server/src/survey/routes.test.ts
git commit -m "feat(server): restore a deleted entity or a binned frame

Every delete was already soft; restore makes Undo real. It is
version-checked like any write, so undoing something a teammate has
touched since is refused with their state, and audited. A binned frame
comes back with exactly the tags binned with it, matched on the shared
timestamp, so a tag removed by hand earlier stays removed.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Client — the new endpoints, the team in the store, and an expired session that keeps your place

**Files:**
- Modify: `packages/editor/src/api/client.ts`, `packages/editor/src/state/store.ts`, `packages/editor/src/state/save.ts`
- Test: `packages/editor/src/api/client.test.ts` (append), `packages/editor/src/state/save.test.ts` (append)

**Interfaces:**
- Consumes: the Task 6 and Task 7 endpoints.
- Produces:
  - Types `TeamMember = { id: string; email: string; displayName: string }`, `PublishedVersion = { version: string; createdAt: string; warningCount: number }`; `SessionUser` gains `mustChangePassword?: boolean`
  - `api.listUsers(): Promise<TeamMember[]>`, `api.inviteUser(email, displayName): Promise<{ user: TeamMember; password: string }>`, `api.resetUserPassword(id)`, `api.changePassword(currentPassword, newPassword): Promise<void>`, `api.restoreEntity(type, id, expectedVersion): Promise<Record<string, unknown>>`, `api.restoreKeyframe(id): Promise<{ sightings: number }>`, `api.latestPublished(): Promise<PublishedVersion | null>`, `api.health(): Promise<boolean>`
  - Store: `team: TeamMember[]`, `setTeam(team)`, `sessionEnd: "signed-out" | "expired" | null`, `endSession(reason)`; `setUser(u)` with a user clears `sessionEnd`
  - Saver: a 401 from a write or from `load()` calls `endSession("expired")`

- [ ] **Step 1: Write the failing tests**

Append to `packages/editor/src/api/client.test.ts`, inside `describe("api client", …)`:

```ts
  it("invites a teammate", async () => {
    const fetchImpl = mockFetch(201, { user: { id: "u2", email: "a@x.com", displayName: "A" }, password: "otp" });
    const result = await createApi({ fetchImpl }).inviteUser("a@x.com", "A");
    expect(result.password).toBe("otp");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/users/invite");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "a@x.com", displayName: "A" });
  });

  it("changes your password", async () => {
    const fetchImpl = mockFetch(204, undefined);
    await createApi({ fetchImpl }).changePassword("old-one", "new-password");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/auth/password");
    expect(JSON.parse(String(init?.body))).toEqual({ currentPassword: "old-one", newPassword: "new-password" });
  });

  it("restores an entity at the version the delete left", async () => {
    const fetchImpl = mockFetch(200, { entity: { id: "p1", version: 2 } });
    await createApi({ fetchImpl }).restoreEntity("pathway", "p1", 1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/entities/pathway/p1/restore");
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 1 });
  });

  it("reports the server unreachable rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createApi({ fetchImpl }).health()).toBe(false);
  });
```

Append to `packages/editor/src/state/save.test.ts`:

```ts
describe("an expired session", () => {
  it("ends the session as expired when a write is refused as signed out", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const updateEntity = vi.fn(async () => { throw new ApiError(401, null); });
    expect(await createSaver(fakeApi({ updateEntity })).update("room", "r1", 0, { nameEn: "x" })).toBe(false);
    expect(useEditorStore.getState().user).toBeNull();
    expect(useEditorStore.getState().sessionEnd).toBe("expired");
  });

  it("clears the reason once someone signs in again", () => {
    useEditorStore.getState().endSession("expired");
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    expect(useEditorStore.getState().sessionEnd).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/api/client.test.ts packages/editor/src/state/save.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `inviteUser` is not a function; `endSession` is not a function.

- [ ] **Step 3: Implement the client methods**

In `packages/editor/src/api/client.ts`, replace the `SessionUser` type and add two types beside it:

```ts
export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  /** True while the account is on a one-time password. */
  mustChangePassword?: boolean;
};

export type TeamMember = { id: string; email: string; displayName: string };

export type PublishedVersion = { version: string; createdAt: string; warningCount: number };
```

and add these methods to the object `createApi` returns, after `me()`:

```ts
    listUsers: async (): Promise<TeamMember[]> =>
      (await request<{ users: TeamMember[] }>("/api/users")).users,

    inviteUser: (email: string, displayName: string) =>
      request<{ user: TeamMember; password: string }>("/api/users/invite", {
        method: "POST",
        body: json({ email, displayName }),
      }),

    resetUserPassword: (id: string) =>
      request<{ user: TeamMember; password: string }>(`/api/users/${id}/reset-password`, {
        method: "POST",
      }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>("/api/auth/password", {
        method: "POST",
        body: json({ currentPassword, newPassword }),
      }),

    /** The other half of Undo: brings back what a delete retired, at the version it left. */
    restoreEntity: async (type: EntityType, id: string, expectedVersion: number) =>
      (await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}/restore`, {
        method: "POST",
        body: json({ expectedVersion }),
      })).entity,

    restoreKeyframe: (id: string) =>
      request<{ sightings: number }>(`/api/keyframes/${id}/restore`, { method: "POST" }),

    latestPublished: async (): Promise<PublishedVersion | null> =>
      (await request<{ latest: PublishedVersion | null }>("/api/publish/latest")).latest,

    /** Whether the server answers at all. Never throws: it is asked on a timer. */
    async health(): Promise<boolean> {
      try {
        await request<{ ok: boolean }>("/api/health");
        return true;
      } catch {
        return false;
      }
    },
```

- [ ] **Step 4: Implement the store and saver changes**

In `packages/editor/src/state/store.ts`:
- import `TeamMember` from `../api/client` alongside the existing types;
- add to `EditorState`:

```ts
  /** Everyone on the team, for owners, avatars and the team page. */
  team: TeamMember[];
  /**
   * Why there is no user. "expired" keeps the page and asks you to sign in
   * again over it; "signed-out" (or null, before anyone signs in) shows the
   * sign-in screen.
   */
  sessionEnd: "signed-out" | "expired" | null;
  setTeam: (t: TeamMember[]) => void;
  endSession: (reason: "signed-out" | "expired") => void;
```

- add to `initial`:

```ts
  team: [] as TeamMember[],
  sessionEnd: null as EditorState["sessionEnd"],
```

- replace `setUser` and add the two setters:

```ts
  // Signing in, or back in, settles why the session had ended.
  setUser: user => set(user ? { user, sessionEnd: null } : { user }),
  setTeam: team => set({ team }),
  endSession: reason => set({ user: null, sessionEnd: reason }),
```

In `packages/editor/src/state/save.ts`, in `guard`'s `catch`, add before the `setStatus` line:

```ts
      // A write refused as signed out: keep the page, ask for a sign-in over it.
      if (err instanceof ApiError && err.status === 401) {
        store.getState().endSession("expired");
        return false;
      }
```

and in `load()` replace `store.getState().setUser(null);` with:

```ts
        store.getState().endSession("expired");
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/api packages/editor/src/state packages/editor/src/auth --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS (the existing "sends someone whose session expired back to sign in" test still passes: the user is null).
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/api/client.ts packages/editor/src/api/client.test.ts packages/editor/src/state/store.ts packages/editor/src/state/save.ts packages/editor/src/state/save.test.ts
git commit -m "feat(editor): the team, passwords and restore in the client; an expired session says so

The API client gains the team, invite, reset, change-password, restore,
latest-publish and health calls. The store holds the team, and records
why a session ended: a write refused as signed out is \"expired\", which
the sign-in gate will answer with a dialog over the page rather than a
blank login screen.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Where each floor stands — progress, your floor, and what blocks publishing

**Files:**
- Create: `packages/editor/src/flow/floors.ts`, `packages/editor/src/flow/floorProgress.ts`, `packages/editor/src/flow/publishBlockers.ts`
- Test: `packages/editor/src/flow/floors.test.ts`, `packages/editor/src/flow/floorProgress.test.ts`, `packages/editor/src/flow/publishBlockers.test.ts`

**Interfaces:**
- Consumes: `placeLevels` (Task 4); `levelChecklist`, `stepForCode`, `StepId` (`flow/checklist.ts`); `labelCounts` (`survey/labelled.ts`); `imageForLevel` (`state/underlay.ts`); `href`, `FloorTab` (Task 3).
- Produces:
  - `floors.ts`: `sortedLevels(model): Level[]`, `findLevel(model, code): Level | null` (case-insensitive), `yourFloor(model, userId, lastFloorCode): Level | null`, `pickTab(remembered: string | null, hasFootage: boolean): FloorTab`
  - `floorProgress.ts`: `type BuildStepId = "floorplan" | "rooms" | "pathways" | "entrances" | "bind" | "dressing"`, `BUILD_STEPS: ReadonlyArray<{ id: BuildStepId; label: string; next: string }>`, `buildStepForCode(code): BuildStepId | null`, `buildStepsDone(model, report, levelImages, levelId): Record<BuildStepId, boolean>`, `type FloorProgress`, `floorProgress(model, report, levelImages, levelId): FloorProgress`, `waitingReview(model, levelId): number`, `nextStepText(p): string`
  - `publishBlockers.ts`: `type Blocker = { message: string; link: string | null; stepLabel: string | null }`, `type BlockerGroup = { key: string; label: string; items: Blocker[] }`, `publishBlockers(model, report): BlockerGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/flow/floors.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { findLevel, pickTab, sortedLevels, yourFloor } from "./floors";

const lvl = (code: string, ordinal: number, ownerIds: string[] = []) => ({
  id: `oth-${code}`, buildingId: "oth", code, ordinal, nameEn: code, nameZh: code,
  elevationM: ordinal * 5, heightM: 5, ownerIds,
});

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [lvl("L3", 3, ["u_aisha"]), lvl("L1", 1, ["u_sc"]), lvl("L2", 2, ["u_wei", "u_gone"])],
});

describe("floors", () => {
  it("sorts floors from the bottom up", () => {
    expect(sortedLevels(model).map(l => l.code)).toEqual(["L1", "L2", "L3"]);
  });

  it("finds a floor by code, whatever its case", () => {
    expect(findLevel(model, "l2")?.id).toBe("oth-L2");
    expect(findLevel(model, "L9")).toBeNull();
  });

  it("takes your floor to be the lowest you own", () => {
    expect(yourFloor(model, "u_wei", null)?.code).toBe("L2");
  });

  it("falls back to the floor you last worked on, then the lowest", () => {
    expect(yourFloor(model, "u_nobody", "L3")?.code).toBe("L3");
    expect(yourFloor(model, "u_nobody", "L9")?.code).toBe("L1");
    expect(yourFloor(model, null, null)?.code).toBe("L1");
  });

  it("picks the tab you last used, else survey where there is footage, else build", () => {
    expect(pickTab("review", false)).toBe("review");
    expect(pickTab(null, true)).toBe("survey");
    expect(pickTab("junk", false)).toBe("build");
  });
});
```

Create `packages/editor/src/flow/floorProgress.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { buildStepForCode, buildStepsDone, floorProgress, nextStepText, waitingReview } from "./floorProgress";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
];
const frame = (id: string, captureId: string) => ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480 });

const model = parseModel({
  building,
  levels,
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_1", "cap_1"), frame("kf_2", "cap_1"), frame("kf_3", "cap_1"), frame("kf_9", "cap_2")],
  places: [
    { id: "p_own", nameEn: "Library", category: "community", levelId: "oth-L1" },
    { id: "p_seen", nameEn: "iTea", category: "retail", status: "proposed" },
    { id: "p_up", nameEn: "Gym", category: "sports", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "p_seen", keyframeId: "kf_1", status: "proposed" },
    { id: "s2", placeId: "p_up", keyframeId: "kf_9", status: "proposed" },
  ],
});

const noImages: LevelImage[] = [];

describe("floorProgress", () => {
  it("counts the floor's frames that carry any tag", () => {
    expect(floorProgress(model, null, noImages, "oth-L1").survey).toEqual({ tagged: 1, total: 3 });
  });

  it("counts review over places on the floor, their own level or their footage's", () => {
    expect(floorProgress(model, null, noImages, "oth-L1").review).toEqual({ confirmed: 1, proposed: 1 });
    expect(waitingReview(model, "oth-L2")).toBe(1);
  });

  it("names the floorplan as next on a floor where nothing is built", () => {
    const p = floorProgress(model, null, noImages, "oth-L1");
    expect(p.build).toEqual({ done: 0, total: 6, next: "floorplan" });
    expect(nextStepText(p)).toBe("Next: add the floorplan and set its scale");
  });
});

describe("buildStepsDone", () => {
  it("does not call binding done on a floor with nothing to bind", () => {
    const empty = parseModel({ building, levels });
    expect(buildStepsDone(empty, null, noImages, "oth-L1").bind).toBe(false);
  });

  it("calls binding done once every confirmed unit on the floor has a room, walkways aside", () => {
    const bound = parseModel({
      building,
      levels,
      places: [
        { id: "a", nameEn: "Library", category: "community", levelId: "oth-L1", roomId: "L1-lib" },
        { id: "w", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
      ],
    });
    expect(buildStepsDone(bound, null, noImages, "oth-L1").bind).toBe(true);
  });
});

describe("buildStepForCode", () => {
  it("files survey issues under Bind places, and the rest where the checklist puts them", () => {
    expect(buildStepForCode("place.unbound")).toBe("bind");
    expect(buildStepForCode("room.unsurveyed")).toBe("bind");
    expect(buildStepForCode("area.unreachable")).toBe("pathways");
    expect(buildStepForCode("entrance.offFloor")).toBe("entrances");
    expect(buildStepForCode("portal.endpoints.insufficient")).toBe("entrances");
    expect(buildStepForCode("something.else")).toBeNull();
  });
});
```

Create `packages/editor/src/flow/publishBlockers.test.ts`:

```ts
import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import { publishBlockers } from "./publishBlockers";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
});

const report: ValidationReport = {
  ok: false,
  errorCount: 3,
  warningCount: 1,
  issues: [
    { severity: "error", code: "area.unreachable", message: "Area \"Hall\" cannot be reached.", entityType: "room", entityId: "L2-hall", levelId: "oth-L2" },
    { severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" },
    { severity: "error", code: "building.entrances.none", message: "No entrance.", entityType: "building", entityId: "oth" },
    { severity: "warning", code: "room.name.missing", message: "Unnamed.", entityType: "room", entityId: "r", levelId: "oth-L1" },
  ],
};

describe("publishBlockers", () => {
  it("lists errors only, the whole building first, then floors bottom up", () => {
    const groups = publishBlockers(model, report);
    expect(groups.map(g => g.label)).toEqual(["Whole building", "L1 · Level 1", "L2 · Level 2"]);
    expect(groups.flatMap(g => g.items)).toHaveLength(3);
  });

  it("links each floor's blocker to the build step that fixes it", () => {
    const l1 = publishBlockers(model, report).find(g => g.key === "oth-L1")!;
    expect(l1.items[0]).toEqual({
      message: "Entrance \"Gate 1\" stands on a wall.",
      link: "/floors/L1/build?step=entrances",
      stepLabel: "Entrances & lifts",
    });
  });

  it("is empty with no report or a clean one", () => {
    expect(publishBlockers(model, null)).toEqual([]);
    expect(publishBlockers(model, { ok: true, errorCount: 0, warningCount: 0, issues: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/flow/floors.test.ts packages/editor/src/flow/floorProgress.test.ts packages/editor/src/flow/publishBlockers.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — the three modules do not resolve.

- [ ] **Step 3: Implement**

Create `packages/editor/src/flow/floors.ts`:

```ts
import { live, type Level, type MapModel } from "@oth/model";
import { FLOOR_TABS, type FloorTab } from "../route";

/** Floors from the bottom up, deleted ones left out. */
export function sortedLevels(model: MapModel | null): Level[] {
  if (!model) return [];
  return [...live(model.levels)].sort((a, b) => a.ordinal - b.ordinal);
}

/** A floor by its code. "l1" typed by hand means L1. */
export function findLevel(model: MapModel | null, code: string): Level | null {
  const wanted = code.toUpperCase();
  return sortedLevels(model).find(l => l.code.toUpperCase() === wanted) ?? null;
}

/**
 * "Your floor", wherever the app says it: the lowest floor you own; if you own
 * none, the one you last worked on in this browser; failing that, the lowest.
 * An owner id for someone no longer on the team simply matches nobody.
 */
export function yourFloor(model: MapModel | null, userId: string | null, lastFloorCode: string | null): Level | null {
  const levels = sortedLevels(model);
  return (
    (userId ? levels.find(l => l.ownerIds.includes(userId)) : undefined) ??
    (lastFloorCode ? levels.find(l => l.code === lastFloorCode) : undefined) ??
    levels[0] ??
    null
  );
}

/**
 * Which tab a floor opens on: the one you last used there; otherwise Survey if
 * the floor has footage to label, and Build if it does not.
 */
export function pickTab(remembered: string | null, hasFootage: boolean): FloorTab {
  if (remembered && (FLOOR_TABS as readonly string[]).includes(remembered)) return remembered as FloorTab;
  return hasFootage ? "survey" : "build";
}
```

Create `packages/editor/src/flow/floorProgress.ts`:

```ts
import { live, placeLevels, type MapModel, type ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import { imageForLevel } from "../state/underlay";
import { labelCounts } from "../survey/labelled";
import { levelChecklist, stepForCode, type StepId } from "./checklist";

export type BuildStepId = "floorplan" | "rooms" | "pathways" | "entrances" | "bind" | "dressing";

/** The six build steps, in the order a floor is built, with what "next" says for each. */
export const BUILD_STEPS: ReadonlyArray<{ id: BuildStepId; label: string; next: string }> = [
  { id: "floorplan", label: "Floorplan", next: "add the floorplan and set its scale" },
  { id: "rooms", label: "Areas & rooms", next: "trace areas and rooms" },
  { id: "pathways", label: "Pathways", next: "draw pathways" },
  { id: "entrances", label: "Entrances & lifts", next: "mark entrances, lifts and stairs" },
  { id: "bind", label: "Bind places", next: "bind surveyed places to rooms" },
  { id: "dressing", label: "Dressing", next: "dress the details" },
];

const FROM_CHECKLIST: Record<StepId, BuildStepId> = {
  floorplan: "floorplan",
  scale: "floorplan",
  rooms: "rooms",
  connect: "pathways",
  entrances: "entrances",
  portals: "entrances",
  dressing: "dressing",
};

/**
 * Which build step owns a validation code. Survey agreement — a place with no
 * room, a room nobody surveyed — is answered by binding, not by tracing.
 */
export function buildStepForCode(code: string): BuildStepId | null {
  if (code.startsWith("place.") || code === "room.unsurveyed") return "bind";
  const step = stepForCode(code);
  return step ? FROM_CHECKLIST[step] : null;
}

/** Which of the six steps a floor has finished, from the existing checklist plus binding. */
export function buildStepsDone(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: LevelImage[],
  levelId: string,
): Record<BuildStepId, boolean> {
  const checklist = levelChecklist({ model, levelId, image: imageForLevel(levelImages, levelId), report });
  const done = (id: StepId) => checklist.find(s => s.id === id)?.status === "done";
  const levels = placeLevels(model);
  // Walkways are stretches of floor, not units: nothing to bind them to.
  const units = live(model.places).filter(
    p => p.status === "confirmed" && !p.pathwayKindId && levels.get(p.id) === levelId,
  );
  return {
    floorplan: done("floorplan") && done("scale"),
    rooms: done("rooms"),
    pathways: done("connect"),
    entrances: done("entrances") && done("portals"),
    // Nothing to bind is not the same as bound: a floor with no survey yet is not done.
    bind: units.length > 0 && units.every(p => Boolean(p.roomId)),
    // The checklist calls dressing done when there is nothing to dress, which
    // on a blank floor would read as one step of six already finished.
    dressing: done("rooms") && done("dressing"),
  };
}

export type FloorProgress = {
  levelId: string;
  /** Frames on the floor's footage that carry at least one tag, of all of them. */
  survey: { tagged: number; total: number };
  /** Places on the floor: confirmed, and still waiting on a person. */
  review: { confirmed: number; proposed: number };
  build: { done: number; total: number; next: BuildStepId | null };
};

/** One floor's progress. The home cards, the floor switcher and the tabs all read this. */
export function floorProgress(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: LevelImage[],
  levelId: string,
): FloorProgress {
  const captures = new Set(live(model.captures).filter(c => c.levelId === levelId).map(c => c.id));
  const frames = live(model.keyframes).filter(k => captures.has(k.captureId));
  const counts = labelCounts(model);
  const levels = placeLevels(model);
  const places = live(model.places).filter(p => levels.get(p.id) === levelId);
  const done = buildStepsDone(model, report, levelImages, levelId);

  return {
    levelId,
    survey: {
      tagged: frames.filter(f => (counts.get(f.id) ?? 0) > 0).length,
      total: frames.length,
    },
    review: {
      confirmed: places.filter(p => p.status === "confirmed").length,
      proposed: places.filter(p => p.status === "proposed").length,
    },
    build: {
      done: BUILD_STEPS.filter(s => done[s.id]).length,
      total: BUILD_STEPS.length,
      next: BUILD_STEPS.find(s => !done[s.id])?.id ?? null,
    },
  };
}

/** Proposals waiting on a person on one floor — the number on the Review tab. */
export function waitingReview(model: MapModel | null, levelId: string): number {
  if (!model) return 0;
  const levels = placeLevels(model);
  return live(model.places).filter(p => p.status === "proposed" && levels.get(p.id) === levelId).length;
}

/** The line on a floor card saying what to do next. */
export function nextStepText(progress: FloorProgress): string {
  const step = BUILD_STEPS.find(s => s.id === progress.build.next);
  return step ? `Next: ${step.next}` : "Every build step done";
}
```

Create `packages/editor/src/flow/publishBlockers.ts`:

```ts
import type { MapModel, ValidationReport } from "@oth/model";
import { href } from "../route";
import { BUILD_STEPS, buildStepForCode } from "./floorProgress";
import { sortedLevels } from "./floors";

export type Blocker = { message: string; link: string | null; stepLabel: string | null };
export type BlockerGroup = { key: string; label: string; items: Blocker[] };

/**
 * What stops Publish, grouped by floor, each linked to the step that fixes it.
 *
 * Errors only: warnings never block. Building-wide problems (no entrance at
 * all, a lift that connects nothing) come first and link nowhere, since no one
 * floor owns them.
 */
export function publishBlockers(model: MapModel | null, report: ValidationReport | null): BlockerGroup[] {
  if (!model || !report) return [];
  const errors = report.issues.filter(i => i.severity === "error");
  if (errors.length === 0) return [];

  const groups: BlockerGroup[] = [];
  const building = errors.filter(i => !i.levelId);
  if (building.length > 0) {
    groups.push({
      key: "building",
      label: "Whole building",
      items: building.map(i => ({ message: i.message, link: null, stepLabel: null })),
    });
  }

  for (const level of sortedLevels(model)) {
    const here = errors.filter(i => i.levelId === level.id);
    if (here.length === 0) continue;
    groups.push({
      key: level.id,
      label: `${level.code} · ${level.nameEn}`,
      items: here.map(i => {
        const step = buildStepForCode(i.code);
        return {
          message: i.message,
          link: step ? href({ name: "floor", code: level.code, tab: "build", params: { step } }) : null,
          stepLabel: step ? BUILD_STEPS.find(s => s.id === step)!.label : null,
        };
      }),
    });
  }
  return groups;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/flow --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/flow/floors.ts packages/editor/src/flow/floors.test.ts packages/editor/src/flow/floorProgress.ts packages/editor/src/flow/floorProgress.test.ts packages/editor/src/flow/publishBlockers.ts packages/editor/src/flow/publishBlockers.test.ts
git commit -m "feat(editor): where each floor stands, your floor, and what blocks publishing

floorProgress is the one answer to \"how far along is L1\": frames
tagged, places decided, and which of the six build steps are done — the
home cards, the switcher and the tabs all read it. yourFloor is the
lowest floor you own, else the last you worked on, else the lowest.
publishBlockers groups publish errors by floor and links each to the
step that fixes it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Undo instead of "are you sure?", and the status bar's messages as toasts

**Files:**
- Create: `packages/editor/src/ui/undo.ts`, `packages/editor/src/ui/remember.ts`, `packages/editor/src/ui/relativeTime.ts`, `packages/editor/src/shell/StatusToasts.tsx`
- Test: `packages/editor/src/ui/undo.test.ts`, `packages/editor/src/ui/helpers.test.ts`, `packages/editor/src/shell/StatusToasts.test.tsx`

**Interfaces:**
- Consumes: `toast`, `useToasts` (Task 2); `api.restoreEntity` (Task 8); `Removal` (`flow/removeLayer.ts`); `Saver` (`state/save.ts`).
- Produces: `deleteWithUndo({ api, saver, removals, label }): Promise<boolean>`; `recall(key): string | null`, `remember(key, value): void` (keys are prefixed `oth.`); `relativeTime(iso, now?): string`; `StatusToasts()` and `looksLikeError(message): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/ui/undo.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
import { useToasts } from "./toast";
import { deleteWithUndo } from "./undo";

beforeEach(() => useToasts.getState().clear());

function fakes() {
  return {
    api: { restoreEntity: vi.fn(async () => ({})) },
    saver: { remove: vi.fn(async () => true), refresh: vi.fn(async () => {}) },
  };
}

const removals = [
  { type: "portalEndpoint" as const, id: "ep-1", version: 3 },
  { type: "portal" as const, id: "lift-a", version: 1 },
];

describe("deleteWithUndo", () => {
  it("deletes, then offers Undo", async () => {
    const { api, saver } = fakes();
    expect(await deleteWithUndo({ api, saver, removals, label: "Lift A" })).toBe(true);
    expect(saver.remove).toHaveBeenCalledTimes(2);
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Deleted Lift A", action: { label: "Undo" } });
  });

  it("undoes in reverse, at the version each delete left, and reloads", async () => {
    const { api, saver } = fakes();
    await deleteWithUndo({ api, saver, removals, label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(api.restoreEntity.mock.calls).toEqual([["portal", "lift-a", 2], ["portalEndpoint", "ep-1", 4]]);
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("says Undo could not happen when a teammate has changed it since", async () => {
    const { api, saver } = fakes();
    api.restoreEntity.mockRejectedValueOnce(new ConflictError({ version: 9 }, null));
    await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    const last = useToasts.getState().toasts.at(-1)!;
    expect(last.tone).toBe("error");
    expect(last.message).toMatch(/changed since/i);
  });

  it("offers nothing when the delete itself failed", async () => {
    const { api, saver } = fakes();
    saver.remove.mockResolvedValueOnce(false);
    expect(await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" })).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
```

Create `packages/editor/src/ui/helpers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { recall, remember } from "./remember";
import { relativeTime } from "./relativeTime";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("remember", () => {
  it("keeps a value for this browser", () => {
    remember("lastFloor", "L2");
    expect(recall("lastFloor")).toBe("L2");
    expect(localStorage.getItem("oth.lastFloor")).toBe("L2");
  });

  it("shrugs off storage a browser refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => remember("k", "v")).not.toThrow();
    expect(recall("k")).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("says just now for the last minute", () => {
    expect(relativeTime("2026-09-27T11:59:30Z", now)).toBe("just now");
  });
  it("speaks in the largest whole unit", () => {
    expect(relativeTime("2026-09-27T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-24T12:00:00Z", now)).toBe("3 days ago");
  });
});
```

Create `packages/editor/src/shell/StatusToasts.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { looksLikeError, StatusToasts } from "./StatusToasts";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("StatusToasts", () => {
  it("turns a status message into a toast and clears it", () => {
    render(<StatusToasts />);
    act(() => useEditorStore.getState().setStatus("Scale set to 0.2100 m per pixel."));
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Scale set to 0.2100 m per pixel.", tone: "info" });
    expect(useEditorStore.getState().status).toBeNull();
  });

  it("shows a failure as an error", () => {
    render(<StatusToasts />);
    act(() => useEditorStore.getState().setStatus("api error 422"));
    expect(useToasts.getState().toasts[0]!.tone).toBe("error");
  });
});

describe("looksLikeError", () => {
  it("recognises the ways the old panels report failure", () => {
    expect(looksLikeError("Can't reach the server. Check your connection and reload the page.")).toBe(true);
    expect(looksLikeError("The server refused to load the map (HTTP 500).")).toBe(true);
    expect(looksLikeError("New lift placed.")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/ui/undo.test.ts packages/editor/src/ui/helpers.test.ts packages/editor/src/shell/StatusToasts.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — modules do not resolve.

- [ ] **Step 3: Implement**

Create `packages/editor/src/ui/undo.ts`:

```ts
import { ConflictError, type Api } from "../api/client";
import type { Removal } from "../flow/removeLayer";
import type { Saver } from "../state/save";
import { toast } from "./toast";

/**
 * Deletes, then offers Undo, instead of asking "are you sure?" first.
 *
 * Every delete here is soft, so undoing is a restore at the version the delete
 * left (one more than it had). Restores run in reverse, so a lift comes back
 * before its last stop. If a teammate has touched it since, the restore is
 * refused, and the toast says so rather than overwriting what they did.
 */
export async function deleteWithUndo({
  api,
  saver,
  removals,
  label,
}: {
  api: Pick<Api, "restoreEntity">;
  saver: Pick<Saver, "remove" | "refresh">;
  removals: readonly Removal[];
  label: string;
}): Promise<boolean> {
  const done: Removal[] = [];
  for (const r of removals) {
    if (!(await saver.remove(r.type, r.id, r.version))) break;
    done.push(r);
  }
  if (done.length === 0) return false;

  toast({
    message: `Deleted ${label}`,
    action: {
      label: "Undo",
      run: async () => {
        try {
          for (const r of [...done].reverse()) await api.restoreEntity(r.type, r.id, r.version + 1);
          await saver.refresh();
          toast({ message: `Restored ${label}`, tone: "success" });
        } catch (err) {
          toast({
            tone: "error",
            message:
              err instanceof ConflictError
                ? `Couldn't undo: ${label} was changed since. Reload to see the latest.`
                : `Couldn't undo ${label}. Check your connection and try again.`,
          });
        }
      },
    },
  });
  return done.length === removals.length;
}
```

Create `packages/editor/src/ui/remember.ts`:

```ts
/**
 * Per-browser memory for conveniences only — the last floor, the last tab.
 * Private windows and blocked storage throw; that is never an error here.
 */
export function recall(key: string): string | null {
  try {
    return localStorage.getItem(`oth.${key}`);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`oth.${key}`, value);
  } catch {
    // Not worth mentioning: the app works the same, it just forgets.
  }
}
```

Create `packages/editor/src/ui/relativeTime.ts`:

```ts
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 days ago", in the largest whole unit; anything under a minute is "just now". */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
```

Create `packages/editor/src/shell/StatusToasts.tsx`:

```tsx
import { useEffect } from "react";
import { useEditorStore } from "../state/store";
import { toast } from "../ui/toast";

/** How the older panels phrase a failure. */
export function looksLikeError(message: string): boolean {
  return /\b(can't|cannot|couldn't|could not|refused|failed|error|not allowed)\b|HTTP \d{3}/i.test(message);
}

/**
 * The status bar is gone; the panels that still report through setStatus now
 * report as toasts. Each message is shown once and cleared, so the same text
 * set twice in a row still shows twice.
 */
export function StatusToasts() {
  const status = useEditorStore(s => s.status);
  const setStatus = useEditorStore(s => s.setStatus);
  useEffect(() => {
    if (!status) return;
    toast({ message: status, tone: looksLikeError(status) ? "error" : "info" });
    setStatus(null);
  }, [status, setStatus]);
  return null;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui packages/editor/src/shell --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/ui/undo.ts packages/editor/src/ui/undo.test.ts packages/editor/src/ui/remember.ts packages/editor/src/ui/relativeTime.ts packages/editor/src/ui/helpers.test.ts packages/editor/src/shell/StatusToasts.tsx packages/editor/src/shell/StatusToasts.test.tsx
git commit -m "feat(editor): Undo instead of \"are you sure?\", and status as toasts

deleteWithUndo deletes, then offers Undo for 8 s; undoing restores in
reverse at the version each delete left, and says plainly when a
teammate has changed it since. StatusToasts turns the older panels'
setStatus messages into toasts so the status bar can go.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The shell — header, floor switcher, tabs, who else is here

**Files:**
- Create: `packages/editor/src/testing/fakeApi.ts`, `packages/editor/src/shell/AppShell.tsx`, `Header.tsx`, `FloorSwitcher.tsx`, `FloorTabs.tsx`, `PresenceAvatars.tsx`, `OwnerAvatars.tsx`
- Test: `packages/editor/src/shell/Header.test.tsx`

**Interfaces:**
- Consumes: `Route`, `href`, `followLink`, `FLOOR_TABS` (Task 3); `findLevel`, `sortedLevels` (Task 9); `floorProgress`, `waitingReview` (Task 9); `Avatar`, `YoursTag`, `Progress`, `Button`, `Popover`, `PopoverClose` (Tasks 1–2); `StatusToasts` (Task 10); `useCollaboration` (`collab/useCollaboration.ts`); `ConflictBanner` (`panels/ConflictBanner.tsx`).
- Produces:
  - `testing/fakeApi.ts`: `fakeApi(overrides?): Api` (every method a `vi.fn` with a harmless default) and `sampleModel` (building, levels L1 owned by `u_sc` and L2 owned by `u_wei`, a capture on L1 with two frames, one proposed place)
  - `AppShell({ api, saver, route, children })` — header, then `PasswordBanner`/`OfflineBanner` slots (added in Task 12), `ConflictBanner`, content; loads the team; runs `useCollaboration`
  - `Header({ api, saver, route })`, `FloorSwitcher({ current, tab })`, `FloorTabs({ level, tab })`, `PresenceAvatars()`, `OwnerAvatars({ ids, size? })`

- [ ] **Step 1: Write the shared test fake**

Create `packages/editor/src/testing/fakeApi.ts`:

```ts
import { parseModel } from "@oth/model";
import { vi } from "vitest";
import type { Api } from "../api/client";

/**
 * A small real-shaped model for shell and screen tests: two floors with
 * owners, a walkthrough on L1 with two frames, and one proposal waiting.
 */
export const sampleModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_sc"] },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4, ownerIds: ["u_wei"] },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
  ],
  places: [{ id: "pl_1", nameEn: "Festive Mall", category: "retail", status: "proposed", proposedBy: "claude-code" }],
  sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1", status: "proposed" }],
});

export const sampleTeam = [
  { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" },
  { id: "u_wei", email: "wei@oth.local", displayName: "Wei Kang" },
];

/** Every Api method as a vi.fn with a harmless default; pass overrides for the ones a test cares about. */
export function fakeApi(overrides: Partial<Record<keyof Api, unknown>> = {}): Api {
  return {
    login: vi.fn().mockResolvedValue({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" }),
    logout: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" }),
    listUsers: vi.fn().mockResolvedValue(sampleTeam),
    inviteUser: vi.fn(),
    resetUserPassword: vi.fn(),
    changePassword: vi.fn().mockResolvedValue(undefined),
    getModel: vi.fn().mockResolvedValue(sampleModel),
    validate: vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }),
    listLevelImages: vi.fn().mockResolvedValue([]),
    createEntity: vi.fn().mockResolvedValue({}),
    updateEntity: vi.fn().mockResolvedValue({}),
    deleteEntity: vi.fn().mockResolvedValue({}),
    restoreEntity: vi.fn().mockResolvedValue({}),
    restoreKeyframe: vi.fn().mockResolvedValue({ sightings: 0 }),
    uploadKeyframe: vi.fn().mockResolvedValue({}),
    keyframeFileUrl: (id: string, w?: number) => `/api/keyframes/${id}/file${w ? `?w=${w}` : ""}`,
    deleteKeyframe: vi.fn().mockResolvedValue(undefined),
    acceptPlace: vi.fn().mockResolvedValue({ sightings: 1 }),
    rejectPlace: vi.fn().mockResolvedValue({ sightings: 1 }),
    deleteCapture: vi.fn().mockResolvedValue({ frames: 0 }),
    listLocks: vi.fn().mockResolvedValue([]),
    listPresence: vi.fn().mockResolvedValue([]),
    acquireLock: vi.fn().mockResolvedValue({ lock: null }),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    listAssets: vi.fn().mockResolvedValue([]),
    uploadAsset: vi.fn(),
    assetFileUrl: (id: string) => `/api/assets/${id}/file`,
    uploadLevelImage: vi.fn(),
    patchLevelImage: vi.fn(),
    levelImageFileUrl: (id: string) => `/api/level-images/${id}/file`,
    publish: vi.fn().mockResolvedValue({ version: "v1", warningCount: 0 }),
    latestPublished: vi.fn().mockResolvedValue(null),
    health: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as Api;
}
```

If `tsc` reports a method of `Api` missing from this list (a method added since this plan was written), add it with a `vi.fn()` default.

- [ ] **Step 2: Write the failing test**

Create `packages/editor/src/shell/Header.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { Header } from "./Header";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
  window.history.pushState({}, "", "/floors/L1/survey");
});

function renderHeader(path = "/floors/L1/survey") {
  const api = fakeApi();
  const route = path === "/floors"
    ? { name: "floors" as const }
    : { name: "floor" as const, code: path.split("/")[2]!, tab: path.split("/")[3] as "survey", params: {} };
  render(<Header api={api} saver={createSaver(api)} route={route} />);
}

describe("Header", () => {
  it("links home from every screen", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "OTH Map" }).getAttribute("href")).toBe("/floors");
  });

  it("shows the floor's tabs, the current one marked, with what is waiting in Review", () => {
    renderHeader();
    const tabs = within(screen.getByRole("navigation", { name: "Workspace" }));
    expect(tabs.getByRole("link", { name: "Survey" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: /Review/ }).textContent).toContain("1");
    expect(tabs.getByRole("link", { name: "Build" }).getAttribute("href")).toBe("/floors/L1/build");
  });

  it("marks your own floor in the switcher", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    const l1 = await screen.findByRole("link", { name: /^L1/ });
    expect(l1.textContent).toContain("Yours");
    expect(screen.getByRole("link", { name: /^L2/ }).getAttribute("href")).toBe("/floors/L2/survey");
  });

  it("has no floor controls on the floors home", () => {
    renderHeader("/floors");
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run packages/editor/src/shell/Header.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./Header` does not resolve.

- [ ] **Step 4: Implement**

Create `packages/editor/src/shell/OwnerAvatars.tsx`:

```tsx
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

/**
 * A floor's owners as overlapping avatars. An id for someone no longer on the
 * team still renders — as "Former teammate" — rather than vanishing, so a
 * floor never looks unowned when it is not.
 */
export function OwnerAvatars({ ids, size = 22 }: { ids: readonly string[]; size?: number }) {
  const team = useEditorStore(s => s.team);
  return (
    <span className="flex -space-x-1.5">
      {ids.map(id => (
        <span key={id} className="rounded-full ring-2 ring-white">
          <Avatar userId={id} name={team.find(m => m.id === id)?.displayName ?? "Former teammate"} size={size} />
        </span>
      ))}
    </span>
  );
}
```

Create `packages/editor/src/shell/PresenceAvatars.tsx`:

```tsx
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

/**
 * Who else is in the app, and on which floor. Silent when you are alone: this
 * should catch your eye only when it means something.
 */
export function PresenceAvatars() {
  const presence = useEditorStore(s => s.presence);
  const model = useEditorStore(s => s.model);
  const me = useEditorStore(s => s.user);

  const others = presence.filter(p => p.userId !== me?.id);
  if (others.length === 0) return null;

  const where = (levelId: string | null) =>
    (levelId && model?.levels.find(l => l.id === levelId)?.code) || "Floors";

  return (
    <div className="flex -space-x-1.5" aria-label="Also here">
      {others.map(p => (
        <span key={p.userId} data-testid={`presence-${p.userId}`} className="rounded-full ring-2 ring-white">
          <Avatar userId={p.userId} name={`${p.displayName} · ${where(p.levelId)}`} size={26} />
        </span>
      ))}
    </div>
  );
}
```

Create `packages/editor/src/shell/FloorTabs.tsx`:

```tsx
import type { Level } from "@oth/model";
import { waitingReview } from "../flow/floorProgress";
import { FLOOR_TABS, followLink, href, type FloorTab } from "../route";
import { useEditorStore } from "../state/store";

const LABELS: Record<FloorTab, string> = { survey: "Survey", review: "Review", build: "Build" };

/** Survey · Review (n) · Build for one floor; n is what is waiting on a person. */
export function FloorTabs({ level, tab }: { level: Level; tab: FloorTab | null }) {
  const model = useEditorStore(s => s.model);
  const waiting = waitingReview(model, level.id);

  return (
    <nav aria-label="Workspace" className="flex gap-1">
      {FLOOR_TABS.map(t => {
        const to = href({ name: "floor", code: level.code, tab: t, params: {} });
        return (
          <a
            key={t}
            href={to}
            onClick={followLink(to)}
            aria-current={tab === t ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {LABELS[t]}
            {t === "review" && waiting > 0 && (
              <span className="rounded-full bg-proposed-soft px-1.5 text-xs text-proposed">{waiting}</span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
```

Create `packages/editor/src/shell/FloorSwitcher.tsx`:

```tsx
import type { Level } from "@oth/model";
import { floorProgress } from "../flow/floorProgress";
import { sortedLevels } from "../flow/floors";
import { followLink, href, type FloorTab } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Popover, PopoverClose } from "../ui/Popover";
import { Progress } from "../ui/Progress";
import { YoursTag } from "../ui/YoursTag";
import { OwnerAvatars } from "./OwnerAvatars";

/** "L1 · Yours ▾": every floor with its owners and build progress, one click away. */
export function FloorSwitcher({ current, tab }: { current: Level; tab: FloorTab }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelImages = useEditorStore(s => s.levelImages);
  const me = useEditorStore(s => s.user);
  const mine = (l: Level) => Boolean(me && l.ownerIds.includes(me.id));

  return (
    <Popover
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Floor ${current.code}, change floor`}>
          <span className="text-base font-bold">{current.code}</span>
          {mine(current) && <YoursTag />}
          <span aria-hidden>▾</span>
        </Button>
      }
    >
      <ul className="w-80">
        {sortedLevels(model).map(level => {
          const to = href({ name: "floor", code: level.code, tab, params: {} });
          const build = model ? floorProgress(model, report, levelImages, level.id).build : null;
          return (
            <li key={level.id}>
              <PopoverClose asChild>
                <a
                  href={to}
                  onClick={followLink(to)}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-stone-100 ${
                    level.id === current.id ? "bg-stone-100" : ""
                  }`}
                >
                  <span className="w-8 font-semibold">{level.code}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-600">{level.nameEn}</span>
                  {mine(level) && <YoursTag />}
                  <OwnerAvatars ids={level.ownerIds} size={20} />
                  {build && (
                    <span className="w-14">
                      <Progress value={build.done} max={build.total} label={`${level.code} build progress`} />
                    </span>
                  )}
                </a>
              </PopoverClose>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
```

Create `packages/editor/src/shell/Header.tsx`. Task 12 adds `PublishButton` and `AccountMenu` to the right-hand group; for now it holds presence only:

```tsx
import type { Api } from "../api/client";
import { findLevel } from "../flow/floors";
import { followLink, type Route } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { FloorSwitcher } from "./FloorSwitcher";
import { FloorTabs } from "./FloorTabs";
import { PresenceAvatars } from "./PresenceAvatars";

/** One row, identical on every screen. */
export function Header({ route }: { api: Api; saver: Saver; route: Route }) {
  const model = useEditorStore(s => s.model);
  const level = route.name === "floor" ? findLevel(model, route.code) : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4">
      <a href="/floors" onClick={followLink("/floors")} className="font-semibold tracking-tight">
        OTH Map
      </a>
      {route.name === "floor" && level && (
        <>
          <FloorSwitcher current={level} tab={route.tab ?? "build"} />
          <FloorTabs level={level} tab={route.tab} />
        </>
      )}
      {route.name === "team" && <span className="text-stone-500">Team</span>}
      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
      </div>
    </header>
  );
}
```

Create `packages/editor/src/shell/AppShell.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import type { Api } from "../api/client";
import { useCollaboration } from "../collab/useCollaboration";
import { ConflictBanner } from "../panels/ConflictBanner";
import type { Route } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Header } from "./Header";
import { StatusToasts } from "./StatusToasts";

/**
 * Every signed-in screen sits in this: the header, the banners that concern
 * the whole app, then the screen. Presence and locks run here, once, whatever
 * the screen.
 */
export function AppShell({ api, saver, route, children }: { api: Api; saver: Saver; route: Route; children: ReactNode }) {
  const setTeam = useEditorStore(s => s.setTeam);

  useEffect(() => {
    // The team is needed for owners and avatars; failing to load it only costs names.
    api.listUsers().then(setTeam).catch(() => {});
  }, [api, setTeam]);

  useCollaboration(api, true);

  return (
    <div className="flex h-full flex-col">
      <Header api={api} saver={saver} route={route} />
      <ConflictBanner onReload={() => void saver.refresh()} />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <StatusToasts />
    </div>
  );
}
```

- [ ] **Step 5: Run the test and the typecheck**

Run: `npx vitest run packages/editor/src/shell --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0 (`Header` takes `api` and `saver` it does not read yet; if `noUnusedParameters` objects, it will not — they are destructured away, not declared as named parameters).

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/testing/fakeApi.ts packages/editor/src/shell/AppShell.tsx packages/editor/src/shell/Header.tsx packages/editor/src/shell/Header.test.tsx packages/editor/src/shell/FloorSwitcher.tsx packages/editor/src/shell/FloorTabs.tsx packages/editor/src/shell/PresenceAvatars.tsx packages/editor/src/shell/OwnerAvatars.tsx
git commit -m "feat(editor): one header for every screen, with the floor you are on

OTH Map goes home; inside a floor, the switcher shows every floor with
its owners and build progress and marks yours, and the tabs read
Survey · Review (n) · Build with n what is waiting on a person. Presence
and locks run in the shell, once, whatever the screen.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Publish with its reasons, the account menu, your password, and the offline banner

**Files:**
- Create: `packages/editor/src/shell/PublishButton.tsx`, `AccountMenu.tsx`, `ChangePasswordDialog.tsx`, `PasswordBanner.tsx`, `OfflineBanner.tsx`
- Modify: `packages/editor/src/shell/Header.tsx`, `packages/editor/src/shell/AppShell.tsx`, `packages/editor/src/panels/ConflictBanner.tsx`
- Test: `packages/editor/src/shell/account.test.tsx`, `packages/editor/src/panels/ConflictBanner.test.tsx` (append)

**Interfaces:**
- Consumes: `publishBlockers` (Task 9); `api.publish`, `api.changePassword`, `api.logout`, `api.health` (Task 8); `endSession`, `setUser` (Task 8); `Dialog`, `Popover`, `PopoverClose`, `Button`, `Avatar`, `toast` (Tasks 1–2).
- Produces: `PublishButton({ api })`, `AccountMenu({ api })`, `ChangePasswordDialog({ api, open, onOpenChange })`, `PasswordBanner({ api })`, `OfflineBanner({ api, pollMs? })`.

- [ ] **Step 1: Write the failing test**

Create `packages/editor/src/shell/account.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { AccountMenu } from "./AccountMenu";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { OfflineBanner } from "./OfflineBanner";
import { PasswordBanner } from "./PasswordBanner";
import { PublishButton } from "./PublishButton";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setUser(me);
  useEditorStore.getState().setModel(sampleModel);
});

describe("PublishButton", () => {
  it("says what blocks publishing, and links to where it is fixed", async () => {
    useEditorStore.getState().setReport({
      ok: false, errorCount: 1, warningCount: 0,
      issues: [{ severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" }],
    });
    render(<PublishButton api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    const link = await screen.findByRole("link", { name: /Gate 1/ });
    expect(link.getAttribute("href")).toBe("/floors/L1/build?step=entrances");
  });

  it("publishes when nothing blocks it, and says so", async () => {
    useEditorStore.getState().setReport({ ok: true, errorCount: 0, warningCount: 2, issues: [] });
    const api = fakeApi({ publish: vi.fn().mockResolvedValue({ version: "v13", warningCount: 2 }) });
    render(<PublishButton api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe("Published v13 with 2 warnings."));
  });
});

describe("ChangePasswordDialog", () => {
  function fill(current: string, next: string, again = next) {
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("New password, again"), { target: { value: again } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("checks length and the repeat before asking the server", () => {
    const api = fakeApi();
    render(<ChangePasswordDialog api={api} open onOpenChange={() => {}} />);
    fill("old", "short");
    expect(screen.getByRole("alert").textContent).toMatch(/10 characters/);
    fill("old", "long-enough-1", "long-enough-2");
    expect(screen.getByRole("alert").textContent).toMatch(/don't match/);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("says a wrong current password without signing you out", async () => {
    const api = fakeApi({ changePassword: vi.fn().mockRejectedValue(new ApiError(422, null)) });
    render(<ChangePasswordDialog api={api} open onOpenChange={() => {}} />);
    fill("wrong", "long-enough-1");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/current password is not right/));
    expect(useEditorStore.getState().user).not.toBeNull();
  });

  it("clears the one-time prompt once changed", async () => {
    useEditorStore.getState().setUser({ ...me, mustChangePassword: true });
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog api={fakeApi()} open onOpenChange={onOpenChange} />);
    fill("old-one", "long-enough-1");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(useEditorStore.getState().user?.mustChangePassword).toBe(false);
  });
});

describe("PasswordBanner", () => {
  it("asks someone on a one-time password to set their own", () => {
    useEditorStore.getState().setUser({ ...me, mustChangePassword: true });
    render(<PasswordBanner api={fakeApi()} />);
    expect(screen.getByRole("status").textContent).toMatch(/one-time password/);
  });

  it("stays quiet otherwise", () => {
    render(<PasswordBanner api={fakeApi()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("AccountMenu", () => {
  it("signs out as a choice, not as an expiry", async () => {
    const api = fakeApi();
    render(<AccountMenu api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(useEditorStore.getState().sessionEnd).toBe("signed-out"));
    expect(api.logout).toHaveBeenCalled();
  });
});

describe("OfflineBanner", () => {
  it("appears while the server cannot be reached", async () => {
    render(<OfflineBanner api={fakeApi({ health: vi.fn().mockResolvedValue(false) })} pollMs={60_000} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("is absent while it can", async () => {
    const health = vi.fn().mockResolvedValue(true);
    render(<OfflineBanner api={fakeApi({ health })} pollMs={60_000} />);
    await act(async () => { await Promise.resolve(); });
    expect(health).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

Append to `packages/editor/src/panels/ConflictBanner.test.tsx`, inside its `describe`:

```tsx
  it("says who changed it, by name, and what", () => {
    useEditorStore.getState().setTeam([{ id: "user_2", email: "wei@oth.local", displayName: "Wei Kang" }]);
    useEditorStore.getState().setConflict({
      entityType: "room", entityId: "L1-a",
      current: { updatedBy: "user_2", version: 3, nameEn: "Stadium" },
    });
    render(<ConflictBanner onReload={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/^Wei Kang changed Stadium/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/shell/account.test.tsx packages/editor/src/panels/ConflictBanner.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — modules do not resolve; the banner does not name Wei.

- [ ] **Step 3: Implement**

Create `packages/editor/src/shell/PublishButton.tsx`:

```tsx
import { useState } from "react";
import type { Api } from "../api/client";
import { publishBlockers } from "../flow/publishBlockers";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Popover, PopoverClose } from "../ui/Popover";
import { toast } from "../ui/toast";

const SHOWN_PER_FLOOR = 5;

/**
 * Publish, for the whole building. While something blocks it, the button opens
 * the list of what — by floor, each linked to the step that fixes it — instead
 * of sitting greyed out with a tooltip nobody finds.
 */
export function PublishButton({ api }: { api: Api }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const [busy, setBusy] = useState(false);

  if (!report || !report.ok) {
    const groups = publishBlockers(model, report);
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    return (
      <Popover align="end" trigger={<Button size="sm">Publish ▾</Button>}>
        <div className="w-96">
          <p className="px-2 pb-2 text-xs text-stone-500">
            {report ? `Fix ${count === 1 ? "this" : `these ${count}`} before publishing:` : "Checking the map…"}
          </p>
          {groups.map(group => (
            <section key={group.key} className="pb-1">
              <h3 className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{group.label}</h3>
              <ul>
                {group.items.slice(0, SHOWN_PER_FLOOR).map((item, i) => (
                  <li key={i}>
                    {item.link ? (
                      <PopoverClose asChild>
                        <a href={item.link} onClick={followLink(item.link)} className="block rounded px-2 py-1 hover:bg-stone-100">
                          {item.message}
                          <span className="text-accent"> → {item.stepLabel}</span>
                        </a>
                      </PopoverClose>
                    ) : (
                      <span className="block px-2 py-1">{item.message}</span>
                    )}
                  </li>
                ))}
              </ul>
              {group.items.length > SHOWN_PER_FLOOR && (
                <p className="px-2 text-xs text-stone-500">and {group.items.length - SHOWN_PER_FLOOR} more</p>
              )}
            </section>
          ))}
        </div>
      </Popover>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await api.publish();
          toast({
            tone: "success",
            message: `Published ${result.version}${result.warningCount ? ` with ${result.warningCount} warnings` : ""}.`,
          });
        } catch {
          toast({ tone: "error", message: "Publishing failed. Check your connection and try again." });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Publishing…" : "Publish"}
    </Button>
  );
}
```

Create `packages/editor/src/shell/ChangePasswordDialog.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { ApiError, type Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** Change your own password. You stay signed in; the one-time prompt goes away. */
export function ChangePasswordDialog({
  api,
  open,
  onOpenChange,
}: {
  api: Api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useEditorStore(s => s.user);
  const setUser = useEditorStore(s => s.setUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 10) return setError("Use at least 10 characters.");
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      if (user) setUser({ ...user, mustChangePassword: false });
      setCurrent("");
      setNext("");
      setAgain("");
      toast({ tone: "success", message: "Password changed." });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? "Your current password is not right."
          : "Couldn't change it. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Change password" description="At least 10 characters. You'll stay signed in.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Current password
          <input className={FIELD} type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        </label>
        <label className="block text-sm">
          New password
          <input className={FIELD} type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
        </label>
        <label className="block text-sm">
          New password, again
          <input className={FIELD} type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

Create `packages/editor/src/shell/PasswordBanner.tsx`:

```tsx
import { useState } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

/** Until you set your own password, a quiet line asks you to. */
export function PasswordBanner({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const [open, setOpen] = useState(false);
  if (!user?.mustChangePassword) return null;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
      You're signed in with a one-time password.
      <Button size="sm" onClick={() => setOpen(true)}>Set your own</Button>
      <ChangePasswordDialog api={api} open={open} onOpenChange={setOpen} />
    </div>
  );
}
```

Create `packages/editor/src/shell/OfflineBanner.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Api } from "../api/client";

const POLL_MS = 15_000;

/**
 * Says when the server cannot be reached, while it cannot. Without it a lost
 * connection looks like buttons that silently do nothing.
 */
export function OfflineBanner({ api, pollMs = POLL_MS }: { api: Pick<Api, "health">; pollMs?: number }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await api.health();
      if (!cancelled) setOffline(!ok);
    };
    void check();
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, pollMs]);

  if (!offline) return null;
  return (
    <div role="alert" className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
      Can't reach the server. Your last change may not have saved — this clears when the connection is back.
    </div>
  );
}
```

Create `packages/editor/src/shell/AccountMenu.tsx`:

```tsx
import { useState } from "react";
import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover, PopoverClose } from "../ui/Popover";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

const ITEM = "block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100";

/** You: your name, your password, the team, and signing out. */
export function AccountMenu({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const endSession = useEditorStore(s => s.endSession);
  const [changing, setChanging] = useState(false);
  if (!user) return null;

  return (
    <>
      <Popover
        align="end"
        trigger={
          <button type="button" aria-label="Account" className="rounded-full">
            <Avatar userId={user.id} name={user.displayName} size={28} />
          </button>
        }
      >
        <div className="px-2 py-1">
          <div className="font-medium">{user.displayName}</div>
          <div className="text-xs text-stone-500">{user.email}</div>
        </div>
        <hr className="my-1 border-stone-200" />
        <PopoverClose asChild>
          <button type="button" className={ITEM} onClick={() => setChanging(true)}>Change password</button>
        </PopoverClose>
        <PopoverClose asChild>
          <a className={ITEM} href="/team" onClick={followLink("/team")}>Team</a>
        </PopoverClose>
        <PopoverClose asChild>
          <button
            type="button"
            className={ITEM}
            onClick={async () => {
              // Signed out on purpose: the sign-in screen, not an "expired" prompt.
              await api.logout().catch(() => {});
              endSession("signed-out");
            }}
          >
            Sign out
          </button>
        </PopoverClose>
      </Popover>
      <ChangePasswordDialog api={api} open={changing} onOpenChange={setChanging} />
    </>
  );
}
```

In `packages/editor/src/shell/Header.tsx`, import `PublishButton` and `AccountMenu`, change the signature to `export function Header({ api, route }: { api: Api; saver: Saver; route: Route })`, and replace the right-hand group with:

```tsx
      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
        <PublishButton api={api} />
        <AccountMenu api={api} />
      </div>
```

In `packages/editor/src/shell/AppShell.tsx`, import `PasswordBanner` and `OfflineBanner` and render them between `<Header … />` and `<ConflictBanner … />`:

```tsx
      <PasswordBanner api={api} />
      <OfflineBanner api={api} />
```

Replace `packages/editor/src/panels/ConflictBanner.tsx` with:

```tsx
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";

/**
 * A conflict is an editorial event, not an error to swallow. Someone else saved
 * this first; the only honest options are to look at their version or to
 * discard yours, so reloading is the one offered — and the banner says who, by
 * name, since "someone else" on a team of six is somebody you can ask.
 */
export function ConflictBanner({ onReload }: { onReload: () => void }) {
  const conflict = useEditorStore(s => s.conflict);
  const setConflict = useEditorStore(s => s.setConflict);
  const team = useEditorStore(s => s.team);
  if (!conflict) return null;

  const by = conflict.current?.updatedBy;
  const who = (typeof by === "string" && team.find(m => m.id === by)?.displayName) || "Someone else";
  const name = conflict.current?.nameEn;
  const what = typeof name === "string" && name !== "" ? name : conflict.entityId;

  return (
    <div role="alert" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
      <span>
        {who} changed <strong>{what}</strong> while you were editing it. Your change was not saved.
      </span>
      <Button
        size="sm"
        onClick={() => {
          setConflict(null);
          onReload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/shell packages/editor/src/panels/ConflictBanner.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS (Header tests and the four existing banner tests included — "names the entity" still finds `L1-a` in its own `<strong>`).
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/shell/PublishButton.tsx packages/editor/src/shell/AccountMenu.tsx packages/editor/src/shell/ChangePasswordDialog.tsx packages/editor/src/shell/PasswordBanner.tsx packages/editor/src/shell/OfflineBanner.tsx packages/editor/src/shell/Header.tsx packages/editor/src/shell/AppShell.tsx packages/editor/src/shell/account.test.tsx packages/editor/src/panels/ConflictBanner.tsx packages/editor/src/panels/ConflictBanner.test.tsx
git commit -m "feat(editor): Publish says what blocks it; your account, your password; offline shows

Publish, while blocked, opens the reasons by floor, each linked to the
step that fixes it. The account menu changes your password (a wrong
current one is said inline, never as a lost session), links the team,
and signs out as a choice. Someone on a one-time password is asked to
set their own until they do, and a banner says when the server is gone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Sign-in — restyled, and an expired session asks over the page

**Files:**
- Modify: `packages/editor/src/auth/LoginScreen.tsx`, `packages/editor/src/auth/AuthGate.tsx`
- Test: `packages/editor/src/auth/AuthGate.test.tsx` (append)

**Interfaces:**
- Consumes: `sessionEnd`, `endSession`, `setUser` (Task 8); `Dialog`, `Button` (Tasks 1–2).
- Produces: `LoginForm({ api, onSignedIn })` (exported from `LoginScreen.tsx`, same labels "Email", "Password" and button "Sign in"); `LoginScreen` unchanged in props; `AuthGate` renders its children plus a "Your session ended" dialog when `sessionEnd === "expired"`.

- [ ] **Step 1: Write the failing test**

Append to `packages/editor/src/auth/AuthGate.test.tsx`, inside `describe("AuthGate", …)`:

```tsx
  it("keeps the page when a session expires, and asks for a sign-in over it", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("expired"));
    expect(screen.getByText("the survey")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@oth.local" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("the survey")).toBeTruthy();
  });

  it("shows the sign-in screen, not the dialog, after signing out on purpose", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("signed-out"));
    expect(screen.queryByText("the survey")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });
```

Add `act` to the test file's `@testing-library/react` import.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/editor/src/auth/AuthGate.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — after `endSession("expired")` the children are gone and there is no dialog.

- [ ] **Step 3: Implement**

Replace `packages/editor/src/auth/LoginScreen.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { ApiError, type Api, type SessionUser } from "../api/client";
import { Button } from "../ui/Button";

/**
 * Why a sign-in failed, in the words of someone who has to fix it.
 *
 * A bare catch here used to report every failure as bad credentials, so a
 * server that was not running looked exactly like a wrong password — and the
 * honest response to that is to reset a password that was never the problem.
 */
export function signInError(err: unknown): string {
  if (err instanceof ApiError) {
    // The server deliberately does not say which of the two was wrong.
    if (err.status === 401) return "Email or password is incorrect.";
    return `The server refused the sign-in (HTTP ${err.status}).`;
  }
  return "Can't reach the server. Check your connection and try again.";
}

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** The form alone, so the full-page screen and the expired-session dialog share it. */
export function LoginForm({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(email, password));
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Email
        <input className={FIELD} type="email" autoComplete="username" spellCheck={false} value={email} required onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        Password
        <input className={FIELD} type="password" autoComplete="current-password" value={password} required onChange={e => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function LoginScreen({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-stone-100">
      <div className="w-80 rounded-lg bg-white p-6 shadow">
        <h1 className="mb-1 text-lg font-semibold">OTH Map</h1>
        <p className="mb-4 text-xs text-stone-500">Survey and build Our Tampines Hub, floor by floor.</p>
        <LoginForm api={api} onSignedIn={onSignedIn} />
      </div>
    </div>
  );
}
```

The existing `LoginScreen.test.tsx` asserted the old unreachable-server wording; if it fails on that one message, update its expectation to `/can't reach the server/i` — the new wording drops "is it running on the expected port?", which is advice for a developer, not a teammate.

In `packages/editor/src/auth/AuthGate.tsx`, import `Dialog` from `../ui/Dialog` and `LoginForm` alongside `LoginScreen`, read `sessionEnd` from the store, and replace the two `return`s after the loading check with:

```tsx
  if (!user && sessionEnd === "expired") {
    // Expired, not signed out: keep the page, so nothing you were looking at is lost.
    return (
      <>
        {children}
        <Dialog
          open
          onOpenChange={() => {}}
          title="Your session ended"
          description="Sign in to carry on where you were. Your last change was not saved."
        >
          <LoginForm api={api} onSignedIn={setUser} />
        </Dialog>
      </>
    );
  }
  if (!user) return <LoginScreen api={api} onSignedIn={setUser} />;
  return <>{children}</>;
```

with `const sessionEnd = useEditorStore(s => s.sessionEnd);` beside the existing `user` selector.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/auth --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/auth/LoginScreen.tsx packages/editor/src/auth/LoginScreen.test.tsx packages/editor/src/auth/AuthGate.tsx packages/editor/src/auth/AuthGate.test.tsx
git commit -m "feat(editor): an expired session asks you to sign in over the page

A write refused as signed out used to leave the page for a blank sign-in
screen. Now the page stays and a dialog asks you to sign back in, then
closes on the same URL. Signing out on purpose still goes to the sign-in
screen. The form is shared, restyled, and no longer tells a teammate to
check which port a server is on.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The Floors home, and who owns which floor

**Files:**
- Create: `packages/editor/src/home/FloorsHome.tsx`, `packages/editor/src/home/FloorCard.tsx`, `packages/editor/src/home/OwnerPicker.tsx`
- Test: `packages/editor/src/home/FloorsHome.test.tsx`

**Interfaces:**
- Consumes: `floorProgress`, `nextStepText` (Task 9); `sortedLevels`, `yourFloor`, `pickTab` (Task 9); `recall` (Task 10); `relativeTime` (Task 10); `OwnerAvatars` (Task 11); `href`, `followLink` (Task 3); `api.latestPublished` (Task 8); `Saver.update`; `fakeApi`, `sampleModel`, `sampleTeam` (Task 11).
- Produces: `FloorsHome({ api, saver })`, `FloorCard({ level, progress, mine, saver })`, `OwnerPicker({ level, saver })`.

- [ ] **Step 1: Write the failing test**

Create `packages/editor/src/home/FloorsHome.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { FloorsHome } from "./FloorsHome";

function fakeSaver() {
  return { update: vi.fn().mockResolvedValue(true) } as never;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  localStorage.clear();
  useEditorStore.getState().setUser({ id: "u_wei", email: "wei@oth.local", displayName: "Wei Kang" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
});

describe("FloorsHome", () => {
  it("sends you on to your floor", async () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const go = screen.getByRole("link", { name: /Continue on L2/ });
    // L2 has no footage, so it opens on Build.
    expect(go.getAttribute("href")).toBe("/floors/L2/build");
  });

  it("shows a card per floor, bottom up, marking yours", () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const cards = screen.getAllByRole("article");
    expect(cards.map(c => within(c).getAllByRole("link")[0]!.textContent)).toEqual(["L1", "L2"]);
    expect(within(cards[1]!).getByText("Yours")).toBeTruthy();
    expect(within(cards[0]!).queryByText("Yours")).toBeNull();
  });

  it("says what is next on each floor", () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(within(screen.getAllByRole("article")[0]!).getByText("Next: add the floorplan and set its scale")).toBeTruthy();
  });

  it("says when the map was last published", async () => {
    const api = fakeApi({
      latestPublished: vi.fn().mockResolvedValue({ version: "v12", createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), warningCount: 0 }),
    });
    render(<FloorsHome api={api} saver={fakeSaver()} />);
    expect(await screen.findByText(/last published v12, 3 days ago/)).toBeTruthy();
  });

  it("assigns an owner from the card", async () => {
    const saver = fakeSaver() as { update: ReturnType<typeof vi.fn> };
    render(<FloorsHome api={fakeApi()} saver={saver as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Owners of L1" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Wei Kang" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("level", "oth-L1", 0, { ownerIds: ["u_sc", "u_wei"] }));
  });

  it("shows an owner who left the team as a former teammate, not as nobody", () => {
    useEditorStore.getState().setTeam([sampleTeam[1]!]);
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(screen.getAllByRole("img", { name: "Former teammate" }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/editor/src/home --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./FloorsHome` does not resolve.

- [ ] **Step 3: Implement**

Create `packages/editor/src/home/OwnerPicker.tsx`:

```tsx
import type { Level } from "@oth/model";
import { OwnerAvatars } from "../shell/OwnerAvatars";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover } from "../ui/Popover";

/** Who owns a floor, set from the floor's own card. */
export function OwnerPicker({ level, saver }: { level: Level; saver: Pick<Saver, "update"> }) {
  const team = useEditorStore(s => s.team);

  const toggle = (id: string) => {
    const next = level.ownerIds.includes(id) ? level.ownerIds.filter(x => x !== id) : [...level.ownerIds, id];
    void saver.update("level", level.id, level.version, { ownerIds: next });
  };

  return (
    <Popover
      align="end"
      trigger={
        // Above the card's stretched link, so it is clickable on its own.
        <button type="button" aria-label={`Owners of ${level.code}`} className="relative z-10 rounded-full">
          {level.ownerIds.length > 0 ? (
            <OwnerAvatars ids={level.ownerIds} />
          ) : (
            <span className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-500">+ Owner</span>
          )}
        </button>
      }
    >
      <p className="px-2 pb-1 text-xs text-stone-500">Who owns {level.code}?</p>
      {team.length === 0 && <p className="px-2 text-xs text-stone-500">Loading the team…</p>}
      <ul>
        {team.map(member => (
          <li key={member.id}>
            <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-100">
              <input
                type="checkbox"
                aria-label={member.displayName}
                checked={level.ownerIds.includes(member.id)}
                onChange={() => toggle(member.id)}
              />
              <Avatar userId={member.id} name={member.displayName} size={20} />
              {member.displayName}
            </label>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
```

Create `packages/editor/src/home/FloorCard.tsx`:

```tsx
import type { Level } from "@oth/model";
import { nextStepText, type FloorProgress } from "../flow/floorProgress";
import { pickTab } from "../flow/floors";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { Progress } from "../ui/Progress";
import { recall } from "../ui/remember";
import { YoursTag } from "../ui/YoursTag";
import { OwnerPicker } from "./OwnerPicker";

function Bar({ label, value, max, empty, tone }: {
  label: string; value: number; max: number; empty: string; tone: "accent" | "confirmed";
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-stone-500">
        <span>{label}</span>
        <span>{max === 0 ? empty : `${value} / ${max}`}</span>
      </div>
      <Progress value={value} max={max} label={`${label} progress`} tone={tone} />
    </div>
  );
}

/** One floor: whose it is, how far along, and what to do next. The whole card opens it. */
export function FloorCard({ level, progress, mine, saver }: {
  level: Level; progress: FloorProgress; mine: boolean; saver: Pick<Saver, "update">;
}) {
  const tab = pickTab(recall(`lastTab.${level.code}`), progress.survey.total > 0);
  const to = href({ name: "floor", code: level.code, tab, params: {} });
  const reviewTotal = progress.review.confirmed + progress.review.proposed;

  return (
    <article
      className={`relative flex h-full flex-col gap-2.5 rounded-lg border bg-white p-4 ${
        mine ? "border-yours ring-1 ring-yours" : "border-stone-200"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* The stretched link makes the whole card a target without nesting controls inside a link. */}
        <a href={to} onClick={followLink(to)} className="text-2xl font-bold after:absolute after:inset-0 after:content-['']">
          {level.code}
        </a>
        {mine && <YoursTag />}
        <span className="ml-auto">
          <OwnerPicker level={level} saver={saver} />
        </span>
      </div>
      <div className="-mt-2 text-xs text-stone-500">{level.nameEn}</div>
      <Bar label="Survey" value={progress.survey.tagged} max={progress.survey.total} empty="no footage yet" tone="accent" />
      <Bar label="Review" value={progress.review.confirmed} max={reviewTotal} empty="nothing to review" tone="confirmed" />
      <Bar label="Build" value={progress.build.done} max={progress.build.total} empty="" tone="accent" />
      <p className="mt-auto pt-1 text-xs font-medium text-stone-700">{nextStepText(progress)}</p>
    </article>
  );
}
```

Create `packages/editor/src/home/FloorsHome.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Api, PublishedVersion } from "../api/client";
import { floorProgress } from "../flow/floorProgress";
import { pickTab, sortedLevels, yourFloor } from "../flow/floors";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { relativeTime } from "../ui/relativeTime";
import { recall } from "../ui/remember";
import { FloorCard } from "./FloorCard";

/**
 * Where everyone lands: your floor one click away, and every floor's owners and
 * progress at a glance — which is what a new teammate otherwise has to ask for.
 */
export function FloorsHome({ api, saver }: { api: Api; saver: Pick<Saver, "update"> }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelImages = useEditorStore(s => s.levelImages);
  const user = useEditorStore(s => s.user);
  const [latest, setLatest] = useState<PublishedVersion | null | undefined>(undefined);

  useEffect(() => {
    api.latestPublished().then(setLatest).catch(() => setLatest(null));
  }, [api]);

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the floors…</p>;

  const levels = sortedLevels(model);
  const progress = new Map(levels.map(l => [l.id, floorProgress(model, report, levelImages, l.id)]));
  const ready = levels.filter(l => progress.get(l.id)!.build.next === null).length;
  const mine = yourFloor(model, user?.id ?? null, recall("lastFloor"));
  const continueTo = mine
    ? href({
        name: "floor",
        code: mine.code,
        tab: pickTab(recall(`lastTab.${mine.code}`), progress.get(mine.id)!.survey.total > 0),
        params: {},
      })
    : null;
  const published =
    latest === undefined ? "" : latest ? ` · last published ${latest.version}, ${relativeTime(latest.createdAt)}` : " · not published yet";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold">Floors</h1>
          <p className="text-xs text-stone-500">
            {ready} of {levels.length} floors ready{published}
          </p>
        </div>
        {mine && continueTo && (
          <a
            href={continueTo}
            onClick={followLink(continueTo)}
            className="ml-auto inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Continue on {mine.code} →
          </a>
        )}
      </div>
      <ul className="mt-5 grid grid-cols-4 gap-4">
        {levels.map(level => (
          <li key={level.id}>
            <FloorCard
              level={level}
              progress={progress.get(level.id)!}
              mine={Boolean(user && level.ownerIds.includes(user.id))}
              saver={saver}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/home --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/home
git commit -m "feat(editor): the Floors home — your floor first, everyone's progress at a glance

Eight cards, bottom up: owners (set from the card), Survey, Review and
Build bars with their numbers, and what is next. Yours is marked, and
Continue opens your floor on the tab you last used there. The summary
says how many floors are ready and when the map was last published.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The Team page — invite, reset, and a password shown once

**Files:**
- Create: `packages/editor/src/team/TeamPage.tsx`, `packages/editor/src/team/InviteDialog.tsx`, `packages/editor/src/team/OneTimePasswordDialog.tsx`, `packages/editor/src/team/inviteMessage.ts`
- Test: `packages/editor/src/team/TeamPage.test.tsx`

**Interfaces:**
- Consumes: `api.listUsers`, `api.inviteUser`, `api.resetUserPassword` (Task 8); `setTeam`, `team`, `presence`, `model` (store); `Dialog`, `Button`, `Avatar`, `toast` (Tasks 1–2); `fakeApi`, `sampleModel`, `sampleTeam` (Task 11).
- Produces: `TeamPage({ api })`; `InviteDialog({ api, open, onOpenChange, onInvited })`; `OneTimePasswordDialog({ issued, onClose })` where `issued: { user: TeamMember; password: string; kind: "invite" | "reset" } | null`; `inviteMessage(kind, origin, email, password): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/editor/src/team/TeamPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { inviteMessage } from "./inviteMessage";
import { TeamPage } from "./TeamPage";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
});

describe("TeamPage", () => {
  it("lists the team with the floors each owns", () => {
    render(<TeamPage api={fakeApi()} />);
    const wei = screen.getByRole("row", { name: /Wei Kang/ });
    expect(within(wei).getByText("L2")).toBeTruthy();
  });

  it("invites a teammate and shows their one-time password once", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockResolvedValue({ user: { id: "u_new", email: "aisha@oth.local", displayName: "Aisha" }, password: "otp-123" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "aisha@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByText("otp-123")).toBeTruthy();
    expect(api.listUsers).toHaveBeenCalled();
  });

  it("forgets the password once its dialog is closed", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockResolvedValue({ user: { id: "u_new", email: "aisha@oth.local", displayName: "Aisha" }, password: "otp-123" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "aisha@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await screen.findByText("otp-123");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("otp-123")).toBeNull());
  });

  it("says plainly when the email is already on the team", async () => {
    const api = fakeApi({ inviteUser: vi.fn().mockRejectedValue(new ApiError(409, null)) });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Wei" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wei@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already on the team/);
  });

  it("asks before resetting someone's password, then shows the new one", async () => {
    const api = fakeApi({
      resetUserPassword: vi.fn().mockResolvedValue({ user: sampleTeam[1], password: "fresh-456" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(within(screen.getByRole("row", { name: /Wei Kang/ })).getByRole("button", { name: "Reset password" }));
    expect(api.resetUserPassword).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Reset Wei Kang's password" }));
    expect(await screen.findByText("fresh-456")).toBeTruthy();
  });
});

describe("inviteMessage", () => {
  it("has everything someone needs to sign in, and nothing else", () => {
    const text = inviteMessage("invite", "https://map.example", "aisha@oth.local", "otp-123");
    expect(text).toContain("https://map.example");
    expect(text).toContain("aisha@oth.local");
    expect(text).toContain("otp-123");
    expect(text).toMatch(/set your own password/i);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/editor/src/team --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — modules do not resolve.

- [ ] **Step 3: Implement**

Create `packages/editor/src/team/inviteMessage.ts`:

```ts
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
```

Create `packages/editor/src/team/OneTimePasswordDialog.tsx`:

```tsx
import type { TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";
import { inviteMessage } from "./inviteMessage";

export type Issued = { user: TeamMember; password: string; kind: "invite" | "reset" };

/**
 * A one-time password, shown once. Closing this forgets it — it is stored
 * nowhere in the clear — so the copy button is right beside it, and if it is
 * lost the answer is simply another reset.
 */
export function OneTimePasswordDialog({ issued, onClose }: { issued: Issued | null; onClose: () => void }) {
  if (!issued) return null;
  const message = inviteMessage(issued.kind, window.location.origin, issued.user.email, issued.password);

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={issued.kind === "invite" ? `${issued.user.displayName} is invited` : `${issued.user.displayName}'s new password`}
      description="This password is shown once. Copy it now — if it's lost, reset it again."
    >
      <div className="space-y-3">
        <div className="rounded border border-stone-200 bg-stone-50 p-3">
          <div className="text-xs text-stone-500">{issued.user.email}</div>
          <div className="mt-1 select-all font-mono text-base">{issued.password}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                toast({ tone: "success", message: "Copied. Send it to them directly, not in a group chat." });
              } catch {
                toast({ tone: "error", message: "Couldn't copy. Select the password above and copy it by hand." });
              }
            }}
          >
            Copy invite message
          </Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
```

Create `packages/editor/src/team/InviteDialog.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { ApiError, type Api, type TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** Name and email; the server makes the account and a one-time password. */
export function InviteDialog({
  api,
  open,
  onOpenChange,
  onInvited,
}: {
  api: Api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (result: { user: TeamMember; password: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.inviteUser(email.trim(), name.trim());
      setName("");
      setEmail("");
      onInvited(result);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Someone with that email is already on the team."
          : err instanceof ApiError && err.status === 400
            ? "Check the name and the email address."
            : "Couldn't send the invite. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite a teammate" description="They'll get a one-time password to sign in with.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Name
          <input className={FIELD} autoComplete="off" value={name} required onChange={e => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Email
          <input className={FIELD} type="email" autoComplete="off" spellCheck={false} value={email} required onChange={e => setEmail(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
```

Create `packages/editor/src/team/TeamPage.tsx`:

```tsx
import { useState } from "react";
import type { Api, TeamMember } from "../api/client";
import { sortedLevels } from "../flow/floors";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";
import { InviteDialog } from "./InviteDialog";
import { OneTimePasswordDialog, type Issued } from "./OneTimePasswordDialog";

/**
 * The team: who is on it, which floors each owns, who is online now, and
 * invites and password resets — without anyone opening a terminal.
 */
export function TeamPage({ api }: { api: Api }) {
  const team = useEditorStore(s => s.team);
  const setTeam = useEditorStore(s => s.setTeam);
  const model = useEditorStore(s => s.model);
  const presence = useEditorStore(s => s.presence);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const levels = sortedLevels(model);
  const reload = () => api.listUsers().then(setTeam).catch(() => {});

  async function reset(member: TeamMember) {
    setResetting(null);
    try {
      const result = await api.resetUserPassword(member.id);
      setIssued({ ...result, kind: "reset" });
    } catch {
      toast({ tone: "error", message: `Couldn't reset ${member.displayName}'s password. Try again.` });
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-xs text-stone-500">Everyone here can invite, reset passwords and assign floors.</p>
        </div>
        <Button variant="primary" className="ml-auto" onClick={() => setInviting(true)}>Invite a teammate</Button>
      </div>

      <table className="mt-5 w-full border-separate border-spacing-0 text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="border-b border-stone-200 py-2">Name</th>
            <th className="border-b border-stone-200 py-2">Email</th>
            <th className="border-b border-stone-200 py-2">Floors</th>
            <th className="border-b border-stone-200 py-2">Now</th>
            <th className="border-b border-stone-200 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {team.map(member => {
            const floors = levels.filter(l => l.ownerIds.includes(member.id)).map(l => l.code);
            const online = presence.find(p => p.userId === member.id);
            const where = online?.levelId ? model?.levels.find(l => l.id === online.levelId)?.code : null;
            return (
              <tr key={member.id} aria-label={member.displayName}>
                <td className="border-b border-stone-100 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar userId={member.id} name={member.displayName} />
                    {member.displayName}
                  </span>
                </td>
                <td className="border-b border-stone-100 py-2 text-stone-600">{member.email}</td>
                <td className="border-b border-stone-100 py-2">
                  {floors.length > 0 ? (
                    <span className="flex gap-1">{floors.map(code => <span key={code} className="rounded bg-stone-100 px-1.5">{code}</span>)}</span>
                  ) : (
                    <span className="text-stone-400">none yet</span>
                  )}
                </td>
                <td className="border-b border-stone-100 py-2 text-xs">
                  {online ? <span className="text-confirmed">● Online{where ? ` · ${where}` : ""}</span> : ""}
                </td>
                <td className="border-b border-stone-100 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setResetting(member)}>Reset password</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <InviteDialog
        api={api}
        open={inviting}
        onOpenChange={setInviting}
        onInvited={result => {
          setInviting(false);
          setIssued({ ...result, kind: "invite" });
          void reload();
        }}
      />

      <Dialog
        open={resetting !== null}
        onOpenChange={open => {
          if (!open) setResetting(null);
        }}
        title={resetting ? `Reset ${resetting.displayName}'s password?` : "Reset password?"}
        description="Their current password stops working at once. You'll get a one-time password to send them."
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setResetting(null)}>Cancel</Button>
          {resetting && (
            <Button variant="danger" onClick={() => void reset(resetting)}>
              Reset {resetting.displayName}'s password
            </Button>
          )}
        </div>
      </Dialog>

      <OneTimePasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/team --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/team
git commit -m "feat(editor): the Team page — invite, reset, and a password shown once

Everyone on the team with the floors they own and whether they are
online. Invite takes a name and an email and shows the one-time password
once, beside a copy button for the whole invite message; closing it
forgets it. Resetting asks first, because the old password stops working
at once.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Wire it together — routes to screens, and the old screens inside the new shell

**Files:**
- Create: `packages/editor/src/shell/Workspace.tsx`, `packages/editor/src/floor/FloorWorkspace.tsx`
- Modify: `packages/editor/src/main.tsx`, `packages/editor/src/App.tsx`, `packages/editor/src/survey/SurveyApp.tsx`
- Test: `packages/editor/src/shell/Workspace.test.tsx`

**Interfaces:**
- Consumes: everything above; `App` and `SurveyApp` (existing); `ReviewPanel` (existing).
- Produces: `Workspace({ api })` — the signed-in route switch; `FloorWorkspace({ api, saver, route })` — resolves the floor, picks and remembers the tab, and (until Plans 2 and 3) hosts the old screens; `App` and `SurveyApp` accept `embedded?: boolean` (no header, no footer; `App` then skips `useCollaboration`, which the shell runs).

- [ ] **Step 1: Write the failing test**

Create `packages/editor/src/shell/Workspace.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { Workspace } from "./Workspace";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  localStorage.clear();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
});

function at(path: string) {
  window.history.pushState({}, "", path);
  render(<Workspace api={fakeApi()} />);
}

describe("Workspace", () => {
  it("sends the root to the floors home", async () => {
    at("/");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(await screen.findByRole("heading", { name: "Floors" })).toBeTruthy();
  });

  it("sends an old survey link to your floor's survey", async () => {
    at("/survey");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/survey"));
  });

  it("chooses a tab for a floor opened without one, and replaces the address", async () => {
    at("/floors/L1");
    // L1 has footage, so Survey.
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/survey"));
  });

  it("takes a floor that does not exist back to the floors home, and says so", async () => {
    at("/floors/L9/build");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(useToasts.getState().toasts.some(t => /no floor L9/i.test(t.message))).toBe(true);
  });

  it("remembers the last tab and floor you used", async () => {
    at("/floors/L2/review");
    await waitFor(() => expect(localStorage.getItem("oth.lastTab.L2")).toBe("review"));
    expect(localStorage.getItem("oth.lastFloor")).toBe("L2");
  });

  it("shows the team page", async () => {
    at("/team");
    expect(await screen.findByRole("heading", { name: "Team" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/editor/src/shell/Workspace.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./Workspace` does not resolve.

- [ ] **Step 3: Give the old screens an `embedded` mode**

In `packages/editor/src/App.tsx`:
- change the signature to `export function App({ api, embedded = false }: { api: Api; embedded?: boolean })`;
- change the collaboration call to `useCollaboration(api, Boolean(user) && !embedded);` with the comment `// Embedded in the shell, which already runs presence and locks for every screen.`;
- wrap the `<header>…</header>` element in `{!embedded && ( … )}`;
- wrap the `<ConflictBanner … />` line in `{!embedded && ( … )}` — the shell shows its own, and two would stack;
- wrap the final `{status && <footer …>…</footer>}` in `{!embedded && status && ( … )}`.

In `packages/editor/src/survey/SurveyApp.tsx`:
- change the signature to `export function SurveyApp({ api, embedded = false }: { api: Api; embedded?: boolean })`;
- wrap its `<header>…</header>` in `{!embedded && ( … )}`;
- wrap its `{status && <footer …>…</footer>}` in `{!embedded && status && ( … )}`.

- [ ] **Step 4: Write the workspace and the route switch**

Create `packages/editor/src/floor/FloorWorkspace.tsx`:

```tsx
import { live } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { App } from "../App";
import { findLevel, pickTab } from "../flow/floors";
import { href, navigate, type FloorRoute } from "../route";
import { createSaver, type Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { ReviewPanel } from "../survey/ReviewPanel";
import { SurveyApp } from "../survey/SurveyApp";
import { recall, remember } from "../ui/remember";
import { toast } from "../ui/toast";

/**
 * One floor's workspace: finds the floor, makes it the active level, picks and
 * remembers the tab.
 *
 * Until Plans 2 and 3 replace them, the tabs host the existing Survey, Review
 * and Build screens without their own headers, so the app stays usable while
 * the shell around them is new.
 */
export function FloorWorkspace({ api, route }: { api: Api; saver: Saver; route: FloorRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const reviewSaver = useMemo(() => createSaver(api, { validate: false }), [api]);
  const level = findLevel(model, route.code);

  useEffect(() => {
    if (level && level.id !== activeLevelId) setActiveLevel(level.id);
  }, [level, activeLevelId, setActiveLevel]);

  useEffect(() => {
    if (!model || level) return;
    toast({ tone: "error", message: `There is no floor ${route.code}. Pick one from the floors.` });
    navigate("/floors", { replace: true });
  }, [model, level, route.code]);

  useEffect(() => {
    if (!model || !level) return;
    if (route.tab === null) {
      const hasFootage = live(model.captures).some(c => c.levelId === level.id);
      navigate(href({ ...route, code: level.code, tab: pickTab(recall(`lastTab.${level.code}`), hasFootage) }), { replace: true });
      return;
    }
    remember(`lastTab.${level.code}`, route.tab);
    remember("lastFloor", level.code);
  }, [model, level, route]);

  if (!model || !level || route.tab === null) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  if (route.tab === "survey") return <SurveyApp api={api} embedded />;
  if (route.tab === "review") {
    return (
      <div className="mx-auto max-w-3xl">
        <ReviewPanel api={api} saver={reviewSaver} />
      </div>
    );
  }
  return <App api={api} embedded />;
}
```

Create `packages/editor/src/shell/Workspace.tsx`:

```tsx
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { FloorWorkspace } from "../floor/FloorWorkspace";
import { yourFloor } from "../flow/floors";
import { FloorsHome } from "../home/FloorsHome";
import { href, navigate, useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { TeamPage } from "../team/TeamPage";
import { recall } from "../ui/remember";
import { AppShell } from "./AppShell";

/** Every signed-in screen: one shell, one saver, and the route picks what fills it. */
export function Workspace({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = useMemo(() => createSaver(api), [api]);
  const model = useEditorStore(s => s.model);
  const user = useEditorStore(s => s.user);

  useEffect(() => {
    void saver.load();
  }, [saver]);

  // Redirects: the root and anything unknown go home; an old survey link goes
  // to your floor's survey. Replaced, so Back never lands on a redirect.
  useEffect(() => {
    if (route.name === "home" || route.name === "not-found") navigate("/floors", { replace: true });
    if (route.name === "legacy-survey" && model) {
      const floor = yourFloor(model, user?.id ?? null, recall("lastFloor"));
      navigate(floor ? href({ name: "floor", code: floor.code, tab: "survey", params: {} }) : "/floors", { replace: true });
    }
  }, [route, model, user]);

  return (
    <AppShell api={api} saver={saver} route={route}>
      {route.name === "floors" && <FloorsHome api={api} saver={saver} />}
      {route.name === "team" && <TeamPage api={api} />}
      {route.name === "floor" && <FloorWorkspace api={api} saver={saver} route={route} />}
    </AppShell>
  );
}
```

Replace `packages/editor/src/main.tsx` with:

```tsx
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api/client";
import { AuthGate } from "./auth/AuthGate";
import { Workspace } from "./shell/Workspace";
import { Toaster } from "./ui/Toaster";
import "@fontsource-variable/inter";
import "./styles.css";

/** One application, one sign-in, one server. The toaster sits outside the gate so sign-in errors can use it too. */
function Root() {
  const api = useMemo(() => createApi(), []);
  return (
    <>
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>
      <Toaster />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/shell packages/editor/src/survey packages/editor/src/floor --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS (the existing SurveyApp tests render it un-embedded, as before).
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/shell/Workspace.tsx packages/editor/src/shell/Workspace.test.tsx packages/editor/src/floor/FloorWorkspace.tsx packages/editor/src/main.tsx packages/editor/src/App.tsx packages/editor/src/survey/SurveyApp.tsx
git commit -m "feat(editor): one application — routes to screens, the old screens inside the new shell

/ goes to the floors home, /survey to your floor's survey, a floor with
no tab to the one you last used there, and a floor that does not exist
back home with a message. Until the Survey and Build workspaces are
rebuilt, their tabs host the existing screens without their own headers,
so the app is usable end to end in the new shell.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Verify it end to end, and record it

**Files:**
- Modify: `docs/design-and-plans/README.md` (the Workspace overhaul row)

**Interfaces:**
- Consumes: the whole plan.

- [ ] **Step 1: The full suite, throttled**

Run: `npx vitest run --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: every file passes, no unhandled errors. Report the totals. A failure in a file this plan did not touch is still reported, by name.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npm run build`
Expected: `✓ built`; the only warning allowed is the existing chunk-size notice.

- [ ] **Step 3: Run it against a copy of the real data**

Never against `packages/server/data` while the main checkout's dev server may hold it (PGlite has one writer). From the worktree root, with `$SCRATCH` the session scratchpad:

```bash
mkdir -p "$SCRATCH/foundation-data"
cp -r ../../../packages/server/data/dev-db ../../../packages/server/data/assets "$SCRATCH/foundation-data/"
cd packages/server
DATA_DIR="$SCRATCH/foundation-data" npx tsx src/index.ts invite check@oth.local "Plan Check"
```

The invite prints a one-time password; keep it out of any file that is committed. Then start the server in the background:

```bash
DATA_DIR="$SCRATCH/foundation-data" PORT=3055 npx tsx src/index.ts
```

The migration from Task 5 runs on start against the copy.

- [ ] **Step 4: Walk it by hand (or with Playwright from `C:/Users/qhuip/Repositories/my_library/node_modules/playwright`)**

At `http://localhost:3055`, confirm each and note the result:
1. `/` shows sign-in; signing in with the one-time password lands on **Floors** and the one-time-password banner shows.
2. Change password from the banner; the banner goes.
3. The home shows 8 cards; set yourself as owner of L1 from its card; **Yours** appears and **Continue on L1** is offered.
4. Continue opens L1; the header shows `L1 · Yours ▾` and Survey · Review (n) · Build; each tab shows the existing screen inside the new shell with no second header.
5. `/floors/l1/build` opens L1's Build; `/floors/L9/survey` returns to Floors with a message.
6. In Build, delete a pathway from the layers list → a toast with **Undo** → Undo brings it back. (If the old Layers panel still deletes without undo here, that is expected until Plan 3 swaps it for `deleteWithUndo`; note it rather than fixing it in this plan.)
7. **Publish ▾** lists what blocks it by floor; a link opens that floor's Build.
8. **/team** lists the team; invite a teammate and see the one-time password once; **Done** forgets it.
9. Stop the server; within 15 s the offline banner shows; start it again and it clears.

Stop the background server afterwards by killing only the process listening on :3055.

- [ ] **Step 5: Record the plan in the design journal**

In `docs/design-and-plans/README.md`, change the Workspace overhaul row's plan cell from `Four plans, written after the spec is reviewed` to:

```
1. [`plans/2026-09-27-workspace-foundation.md`](plans/2026-09-27-workspace-foundation.md)<br>2–4. Survey & Review, Build, Deploy — to follow
```

- [ ] **Step 6: Commit**

```bash
git add docs/design-and-plans/README.md docs/design-and-plans/plans/2026-09-27-workspace-foundation.md
git commit -m "docs(plan): workspace overhaul, plan 1 — foundation

The shell, the Floors home, the team and account screens, toasts and
undo, level owners and the server endpoints behind them; the old Survey
and Build screens run inside the new shell until plans 2 and 3 replace
them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Carried forward to plans 2–4

What the final review left for later plans. Nothing here ships to teammates, because deployment waits for plan 4.

**Plan 2's first task**
- *Expired-session dialog:* "Your last change was not saved." is usually untrue now that the presence poll notices expiry first. Say it only when a save actually failed.
- *Owner avatars while the team loads:* the "Team member" placeholder shows the initials "TM", which read as a real person. Use a glyph and an honest name ("Owner – name not loaded"), and give the switcher the failure message too.
- *Old screens and 401s:* these show a raw "api error 401" beside the expired dialog; give them `isUnauthorized`:
  - SurveyApp
  - FloorplanPanel
  - AssetLibrary
  - panels/PublishButton
  - CaptureVideo
- *Housekeeping:*
  - The App docstring still says "Only ever rendered signed in".
  - The thumbnail cleanup test never exercises a failed rename.

**Plan 2 (Survey & Review)**
- *Undoing a reject:* it must bring back the place's sightings (those with the same `deletedAt`). The generic restore brings back only the place.
- *Keyframe delete and restore:* make both audited and transactional, and bump the version, before frame Undo uses them.

**Plan 3 (Build)**
- *`deleteWithUndo`:* refresh in `finally`, and say what was restored when only part of an undo succeeds.
- *Placing a lift:* it saves the portal and its stop separately, so a failed second save leaves an orphan portal.
- *Screens and sessions:* new workspaces must not return early when there is no `user`. An expired session keeps the page.
- *Name fields:* key each uncontrolled name field by entity id.
- *Double load:* it goes once the old screens are replaced, and with it the doubled error toasts.
- *Error toasts:* each rebuilt screen's error toasts offer Retry (spec §6).

**Later, if it comes up**
- A former owner can't be unticked; people only leave the team by a direct database edit.
- Two invites for the same email at the same moment return a 500.
