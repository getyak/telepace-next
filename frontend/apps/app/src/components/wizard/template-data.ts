export type Template = {
  id: string;
  category: string;
  categoryKey: string;
  title: string;
  description: string;
  questions: Array<{ question: string; goal: string }>;
};

export const TEMPLATES: Template[] = [
  {
    id: "market-research",
    category: "Market research",
    categoryKey: "categoryMarket",
    title: "Market positioning study",
    description:
      "Understand how the market perceives your category, competitors, and where you can carve out a distinct position.",
    questions: [
      {
        question:
          "When you think about this category, which brands or products come to mind first?",
        goal: "Surface top-of-mind competitors and category leaders.",
      },
      {
        question:
          "What problem were you trying to solve when you started looking for a solution like this?",
        goal: "Identify the core job-to-be-done driving purchase intent.",
      },
      {
        question:
          "How do you currently compare options before deciding which one to use?",
        goal: "Map the evaluation criteria and decision process.",
      },
      {
        question:
          "What would make you switch away from the solution you use today?",
        goal: "Reveal switching triggers and unmet needs.",
      },
      {
        question:
          "If you could describe the ideal solution in one sentence, what would it say?",
        goal: "Capture the aspirational positioning in the user's own words.",
      },
    ],
  },
  {
    id: "ux-research",
    category: "UX research",
    categoryKey: "categoryUx",
    title: "Usability and experience study",
    description:
      "Explore how people actually experience your product, where friction lives, and which moments delight or frustrate them.",
    questions: [
      {
        question:
          "Walk me through the last time you used the product to accomplish a task.",
        goal: "Reconstruct a real task flow and its context.",
      },
      {
        question:
          "Where did you feel confident, and where did you feel unsure about what to do next?",
        goal: "Locate moments of clarity versus confusion.",
      },
      {
        question:
          "Was there anything that took longer or was harder than you expected?",
        goal: "Identify friction points and effort spikes.",
      },
      {
        question:
          "What part of the experience stood out to you, positively or negatively?",
        goal: "Capture memorable emotional peaks and pain points.",
      },
      {
        question:
          "If you had a magic wand, what one thing would you change about the experience?",
        goal: "Prioritize the highest-impact improvement from the user's view.",
      },
    ],
  },
  {
    id: "product-discovery",
    category: "Product discovery",
    categoryKey: "categoryProduct",
    title: "Product needs discovery",
    description:
      "Dig into the underlying needs, workflows, and workarounds that reveal what to build next and why it matters.",
    questions: [
      {
        question:
          "Tell me about the workflow this fits into — what happens before and after?",
        goal: "Understand the surrounding workflow and dependencies.",
      },
      {
        question:
          "What are you doing today to get this done, even if it's a workaround?",
        goal: "Expose current behaviors and improvised solutions.",
      },
      {
        question: "What's the most painful part of that process right now?",
        goal: "Pinpoint the sharpest pain worth solving.",
      },
      {
        question:
          "How often does this come up, and what happens when it goes wrong?",
        goal: "Gauge frequency and the cost of failure.",
      },
      {
        question:
          "If this were solved perfectly, what would become possible for you?",
        goal: "Uncover the desired outcome and its value.",
      },
    ],
  },
  {
    id: "concept-testing",
    category: "Concept testing",
    categoryKey: "categoryConcept",
    title: "Concept validation study",
    description:
      "Put an early idea, mockup, or value proposition in front of your audience to validate appeal before you build.",
    questions: [
      {
        question:
          "Based on what you just saw, how would you describe this in your own words?",
        goal: "Test whether the concept is understood as intended.",
      },
      {
        question:
          "What's appealing about this idea, and what's unclear or concerning?",
        goal: "Balance perceived value against objections.",
      },
      {
        question: "How well does this fit a real situation you've been in?",
        goal: "Assess relevance to actual user context.",
      },
      {
        question:
          "What would you need to see or know before you'd be willing to try it?",
        goal: "Identify adoption barriers and proof required.",
      },
    ],
  },
];
