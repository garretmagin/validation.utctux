# UTCT UX Demo — Narration Transcript

**Total runtime target: ~3:00–3:30**

---

## [0:00–0:08] Title Slide

> This is UTCT UX — a tool we built to visualize Windows test execution and help teams accelerate their test signal.

---

## [0:08–0:40] Slide 1 — The Problem

> This started with a real conversation. A team told us that most of their RI gate tests take twelve-plus hours to run. Instinctively, that didn't sound right — but we had no data at our fingertips to show otherwise.
>
> The slide shows three challenges we faced. First, there was simply no visibility — no tool existed to see when tests actually start and finish relative to a build. Second, we were asking the wrong question — is the bottleneck test *runtime*, or the time tests spend *waiting* for build artifacts? And third, without that data, optimization is just guesswork.

---

## [0:40–1:15] Slide 2 — AI-Accelerated Development

> This slide shows the journey from that conversation to a deployed tool. With GitHub Copilot as a development partner, we had a working Gantt chart prototype in several hours stictching datasources together. After showing it to a few people, the demand was immediate — teams wanted to generate these views for their own branches. Within a week, it evolved into a full web application available at ux.utct.dev. During FHL week, we enhanced it with dependency analysis and critical-path visualization.
>
> The key takeaway here: AI kept the focus on solving the problem, not building infrastructure. Instead of weeks of scaffolding, we spent our time on the visualizations and insights that actually matter.

---

## [1:15–1:25] Transition to Live Demo

> Let me show you what that looks like. This is the live site at ux.utct.dev.

---

## [1:25–1:55] Live Demo — Build Selection & Loading

> First, we select a branch — in this case, main — and pick a recent build to analyze. The tool reaches out to multiple data sources across UTCT, CloudTest, and Nova to assemble a complete picture of every testpass in this build. You can see the progress updating in real time as it gathers data.

---

## [1:55–2:30] Live Demo — The Gantt Chart

> Here's the Gantt chart. Each horizontal bar represents a single testpass — when it started and when it ended, all measured relative to when the build began. The bars are color-coded by execution system.
>
> This is where the data tells a different story than what that team expected. The majority of testpasses actually start within the first few hours. The perception of twelve-plus hours comes from a handful of late-starting tests — and now that we can see them, we can ask the right question: why did *these* tests start late?
>
> Above the chart, the summary dashboard breaks down totals by execution system, requirement category, and status — giving teams and leadership a single view of test health for any build.

---

## [2:30–3:05] Live Demo — Dependency Deep Dive

> Let's click on one of those late-starting testpasses to understand what's happening. The detail panel shows every build artifact — every chunk — that this test depends on before it can begin.
>
> The red-highlighted path shows the critical dependency chain — the slowest sequence of artifacts that determined when this test could start. For this testpass, it comes down to just a couple of key chunks.
>
> This is the actionable insight: if we can produce those specific artifacts even a few minutes sooner, this entire testpass starts earlier. Now multiply that across dozens of testpasses with similar bottlenecks, and you see how targeted improvements to artifact production translate directly into faster test signal for the whole organization.

---

## [3:05–3:30] Slide 4 — Impact & What's Next

> This slide shows where we are and where we're headed. Today, we've already used these insights to identify optimizations that pull in test start times considerably. And any team can self-serve — pick a branch, pick a build, and see the full story.
>
> Looking ahead, we're leveraging AI and this data to automatically analyze which dependency chains are the most frequent bottlenecks across many builds — moving from seeing the problem to predicting and preventing it. Our goal is that every team in Windows can understand and accelerate their test signal.

---

## Accessibility Notes

- Every visual element is described in the narration (slide content, chart layout, color coding, dependency trees)
- No references to "as you can see" or "read this slide"
- A listener with no visual access can follow the full narrative
- Descriptions use concrete language: "horizontal bars", "red-highlighted path", "summary dashboard above the chart"
