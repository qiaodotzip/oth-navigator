# Documentation

Everything written down while building **OTH Navigator** for the Tampines AI JOM
Hackathon — the product thinking, the engineering decisions, and the full AI-assisted
design-and-build journal. New here? Read in the order below.

---

## 1. Start with the product

| Doc | What it is |
|---|---|
| [`PRD.md`](PRD.md) | **Product Requirements Document.** The clearest single read: problem, users (with personas), goals, the v0.1 feature list, roadmap, risks, and an architecture summary. Start here. |
| [`OTH_navigation_context.md`](OTH_navigation_context.md) | The **early brainstorm**, carried over from a prior planning conversation — the menu of technical approaches we weighed (full 3D vs. spatial reasoning vs. 2.5D diorama) and *why* we chose the lightweight route. Good for understanding the "why not just…" questions. |
| [`FUTURE_FEATURES.md`](FUTURE_FEATURES.md) | **Post-hackathon ideas** — concrete, free, official data sources (LTA DataMall, etc.) we'd wire in next. |

## 2. Run it / understand the two-app system

| Doc | What it is |
|---|---|
| [`BACKEND_INTEGRATION_PLAN.md`](BACKEND_INTEGRATION_PLAN.md) | **How tamp and JOM talk.** The contract: JOM returns ranked services with no spatial data; this app maps each to a floor + room and routes there. (To run *just* this map, the root [`README.md`](../README.md) quick-start is all you need.) |
| [`architecture.excalidraw`](architecture.excalidraw) | The hand-drawn architecture diagram (open at [excalidraw.com](https://excalidraw.com)). The always-renders version lives in the root README. |

## 3. The AI-assisted design journal

| Folder | What it is |
|---|---|
| [`design-and-plans/`](design-and-plans/README.md) | **The heart of "how this was built."** A spec (the *what & why*) and a step-by-step implementation plan (the *how*) for every major feature, produced while pair-building with an AI coding assistant. See that folder's own README for a feature-by-feature map and reading guide. |

## 4. The research trail

The data behind the map didn't come from nowhere. [`../research/`](../research/README.md)
documents exactly which public sources every OTH service location came from, what was
verifiable, and what still needs an on-site check.

---

### How to read it depending on who you are

- **"I just want to see what it does"** → root [`README.md`](../README.md) → [`PRD.md`](PRD.md).
- **"I'm a developer who wants to extend it"** → [`PRD.md`](PRD.md) → [`design-and-plans/`](design-and-plans/README.md) → the spec+plan for the feature you're touching.
- **"I'm curious how you built this with AI"** → [`OTH_navigation_context.md`](OTH_navigation_context.md) (the brainstorm) → [`design-and-plans/`](design-and-plans/README.md) (the specs & plans the AI and I produced together).
- **"Is the data real / trustworthy?"** → [`../research/`](../research/README.md).
