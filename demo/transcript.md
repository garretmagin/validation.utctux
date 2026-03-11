# UTCT UX Demo — Narration Transcript

**Total runtime target: ~2:00**

---

## [0:00–0:06] Title Slide

> Hi, I'm Garret's AI assistant, presenting UTCT UX — a tool we built to visualize Windows test execution and help teams accelerate their test signal.

---

## [0:06–0:26] Slide 1 — The Problem

> This started with a real conversation. A team told us that most of their RI gate tests take twelve-plus hours to run. Instinctively, that didn't sound right — but we had no data at our fingertips to show otherwise.
>
> The slide shows three challenges we faced. First, no visualization — we had the data, and we regularly look at aggregate metrics and delivery impact, but there was no way to see the timeline of individual test execution relative to a build. Second, we were asking the wrong question — is the bottleneck test *runtime*, or the time tests spend *waiting* for build artifacts? And third, we can measure what we optimize, but the visualization helps direct us to the right long poles — the ones that impact customers most in making their code flow decisions.

---

## [0:26–0:46] Slide 2 — AI-Accelerated Development

> With GitHub Copilot as a development partner, we had a working Gantt chart prototype in a single day stitching datasources together. After showing it to a few ES engineers, the demand was immediate — they wanted it for investigating customer builds. So within a week we stood up a shared web service at ux.utct.dev. During FHL week, we polished the experience and added dependency analysis, critical-path visualization, and rerun detection.
>
> AI kept the focus on solving the problem, not building infrastructure.

---

## [0:46–1:04] Slide 3 — First Discovery

> The tool paid off immediately. The very first time we looked at a customer branch, one testpass jumped out — a bar stretching across the entire chart, sometimes running for 24 hours. It wasn't test complexity — it was a device pool capacity problem.
>
> The fix was straightforward: move those AutoPlus testpasses to a standard shared automation pool. The bottleneck disappeared. Without the visualization, this would have stayed hidden in aggregate metrics.

---

## [1:04–1:10] Transition to Live Demo

> Let me show you what that looks like. This is the live site at ux.utct.dev.

---

## [1:10–1:25] Live Demo — Build Selection & Loading

> We select a branch and pick a recent build. The tool reaches out to UTCT, CloudTest, and Nova to assemble a complete picture of every testpass in this build.

---

## [1:25–1:45] Live Demo — The Gantt Chart

> Each horizontal bar represents a testpass — when it started and ended, relative to the build. The bars are color-coded by execution system. The majority of testpasses start within the first few hours — the perception of twelve-plus hours comes from a handful of late starters. Now we can ask the right question: why did *these* tests start late?

---

## [1:45–2:00] Live Demo — Dependency Deep Dive

> Clicking a late-starting testpass shows every chunk it depends on. The red-highlighted path is the critical dependency chain — the slowest sequence of artifacts that determined when this test could start. If we produce those artifacts sooner, this entire testpass starts earlier. Multiply that across dozens of similar bottlenecks and you see how targeted improvements translate directly into faster test signal.

---

## Accessibility Notes

- Every visual element is described in the narration (slide content, chart layout, color coding, dependency trees)
- No references to "as you can see" or "read this slide"
- A listener with no visual access can follow the full narrative
- Descriptions use concrete language: "horizontal bars", "red-highlighted path", "summary dashboard above the chart"
