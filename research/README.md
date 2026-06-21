# Research — the data-sourcing trail

Where the OTH service data in the app actually came from. The project rule was: **never
invent a location.** Every service the app routes to traces back to a public source
documented here, and anything that *couldn't* be verified is logged rather than guessed.

| File | What it is |
|---|---|
| [`services-merged.md`](services-merged.md) | **The merged directory (start here).** Cross-references the OTH Hub Guide PDF with the People's Association Festive Mall Directory (and Wikipedia for the library) into one list of L1 + L2 services — each with a provider, unit/zone, hours, and at least one cited source. This is what fed `public/data/services.json`. |
| [`oth-services-from-pdf.md`](oth-services-from-pdf.md) | The raw extraction from [`images/othhubguide2020.pdf`](../images/othhubguide2020.pdf) (the 2020 One Tampines Hub Guide), with verbatim quotes and page numbers for each facility. |
| [`gaps.md`](gaps.md) | **What's *not* safe to ship without a phone call or on-site visit** — the sources that 404'd or wouldn't load, and the specific facts (some unit numbers, accessibility details) that remain unverified. |

> All of this is **demo-grade** data. Verify specifics with OTH Customer Service before
> relying on them in the real world.
