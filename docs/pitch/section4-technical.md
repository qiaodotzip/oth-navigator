# Section 4 — Technical Feasibility / What's Clever / How It Works

> Speaker notes + slide copy. Keep the on-slide text short; push detail to the Appendix.
> Architecture diagram: `docs/pitch/oth-architecture.excalidraw`.

---

## Slide 4.0 — How it works (the one-liner)

**Two specialised layers, one citizen journey.**

- **Buddy (AI concierge)** turns a messy, real-life problem in plain words or Singlish — *"kena retrenched, BTO cannot pay, no money for food"* — into the **right government services**.
- **The Navigator (2.5D map)** turns those services into an **actual, accessibility-aware walking route** through Our Tampines Hub.
- They're **decoupled**, linked by one tiny "journey" JSON — each builds, demos, and deploys on its own.

**The clever twist:** we don't reconstruct the building or train a model. We *reason* over **sparse public data** — hybrid search + an LLM for the *what/where*, a traced 2.5D diorama + A\* for the *how-to-get-there* — and we're **honest**: we only route to places we've actually mapped, and never invent a location.

---

## Slide 4.1 — The flow (4 steps)

1. **Ask, however you talk.** Type or speak (Whisper + Singlish correction). No forms, no jargon.
2. **Resolve the intent.** Hybrid retrieval + LLM rerank maps the problem → exact agencies/schemes, filtered by eligibility — with an honest *"let me get you to a person"* when unsure.
3. **Hand off a plan.** Buddy publishes a structured multi-stop journey (e.g. HDB → ComCare → …).
4. **Walk it.** The Navigator routes it on a 2.5D model of OTH, step-by-step — **step-free if needed**, picking the **less-busy counter**, *"take the lift to L5"* for floors we haven't modelled.

---

## Slide 4.2 — Architecture & tech stack  *(diagram slide)*

> Drop in the Excalidraw export here.

- **Buddy — AI concierge (Python · FastAPI):** Chroma (dense, MiniLM ONNX) + BM25 (sparse) → **RRF fusion** → **GPT-4o-mini reranker** + confidence gate; Singlish/acronym expansion; eligibility filter; GPT-4o Responses API (web search); **Whisper** STT + **ElevenLabs** TTS.
- **Navigator — 2.5D wayfinder (React + Vite + TypeScript):** React Three Fiber / three.js extruded model (L1–L3); **A\*** wall-avoiding pathfinding + line-of-sight smoothing; Zustand; Tailwind; accessibility (step-free / lift-only) + live counter-load routing.
- **The contract:** one JSON over **localhost** (`GET /api/current-journey` + per-step deep link). No cloud hop between the apps → demo-robust on a hotspot.
- **Data — no database:** public floor plans hand-traced to polygons via our in-app editor; 23-service government catalog with source URLs + eligibility metadata.

---

## Slide 4.3 — What's clever (lead with these)

1. **Spatial reasoning, not reconstruction.** No 3D scan, no on-site capture, no indoor-GIS feed. Public floor plans → 2.5D diorama + a lightweight nav graph. Ships in hours, runs in any browser.
2. **Hybrid, Singlish-aware retrieval.** Dense + sparse + RRF + LLM rerank, tuned for SG acronyms and Singlish. **Recall@3 = 0.96** on 28 labelled queries — *keyless* (works even if the LLM is offline).
3. **Honest by design.** Routes only to rooms we've actually traced; online-only services get the online option; unmapped floors get a *"take the lift to Level 5"* hand-off; low confidence → human. **Never confidently wrong** in physical space.
4. **Accessibility + live load are first-class routing inputs.** Step-free yields a genuinely *different* route; the guide steers to the less-busy of multiple counters.
5. **Two decoupled apps.** Concierge and map evolve and fail independently, linked by one JSON. (Also why we could build them in parallel.)

---

## Appendix — for Q&A

**A1. Retrieval pipeline.** Query → acronym/Singlish expansion → two legs (Chroma cosine over rich descriptions; BM25 over name+agency+desc) → over-retrieve pool of 10 → **RRF (k=60)** fuse → eligibility filter (citizenship/age) → **GPT-4o-mini** rerank with 0–1 scores → `confidence_low = top < 0.3`. Keyless fallback = RRF order. Stable `retrieve_services()` contract.

**A2. Routing.** A\* on a grid of walkable cells (rooms / corridors / landmarks; non-destination rooms block), line-of-sight smoothing that never re-crosses a wall, connector picker that chooses the lift/escalator/stair minimising *actual* walking distance, cross-floor hops, and `unmodelledLevel` lift hand-offs for L4/L5. Step-free profile = lifts only.

**A3. Honest routing detail.** `ROUTABLE_SERVICE_IDS` allow-list = services that map to a real traced room (or the shared ServiceSG counter). Digital_Hotline (CPF/AIC/Baby Bonus) → online option. B1 tenants / off-site → info only.

**A4. Stack versions.** React 18, Vite 5, TypeScript 5, R3F 8 / three 0.165, Zustand 4, Tailwind 3; Python 3.11, FastAPI, chromadb 0.5, rank-bm25, OpenAI SDK, httpx.

**A5. Privacy / cost.** No accounts, no tracking; voice handled per-request; runs on a single OpenAI key + free-tier hosting; the whole retrieval layer works **without any key** (RRF).

**A6. Honest limits (v0.1).** L1–L3 modelled (L4–L8 are lift hand-offs); counter loads simulated (Perlin) — the hook for real queue data is in place; service catalog is source-verified but demo-dated.
