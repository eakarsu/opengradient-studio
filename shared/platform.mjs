export const providers = [
  { id: 'openrouter', label: 'OpenRouter', description: 'Cloud language models through your existing API key.' },
  { id: 'opengradient', label: 'OpenGradient', description: 'TEE inference through the official SDK and your Base wallet.' },
  { id: 'onnx', label: 'Uploaded ONNX', description: 'Run your uploaded model on this computer.' },
  { id: 'opengradient-ml', label: 'OpenGradient ML', description: 'Run a published model CID on the alpha testnet.' },
];
export const networks = {
  opengradient: { name: 'OpenGradient testnet', rpc: 'https://ogevmdevnet.opengradient.ai', chainId: 10740, explorer: 'https://explorer.opengradient.ai' },
  alpha: {
    name: 'OpenGradient alpha', rpc: 'https://eth-devnet.opengradient.ai', chainId: 10744,
    explorer: 'https://testnetv1.opengradient.ai', deprecated: true,
    docs_url: 'https://docs.opengradient.ai/learn/network/deployment.html',
  },
  base: { name: 'Base', rpc: 'https://mainnet.base.org', chainId: 8453, explorer: 'https://basescan.org' },
  ethereum: { name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', chainId: 1, explorer: 'https://etherscan.io' },
};
export const inferenceExamples = [
  { label: 'Launch brief', input: 'Prepare a concise launch brief for a document search feature. The team has two weeks, three engineers, and a goal of reducing time to find relevant documents. Include milestones, risks, and acceptance criteria.' },
  { label: 'Customer insights', input: 'Analyze this illustrative customer feedback: search is slow; onboarding is clear; audit exports are missing; permissions are confusing. Prioritize improvements and suggest a practical next step for each.' },
  { label: 'Research plan', input: 'Design an evaluation comparing a small language model with a larger one for answering questions from internal documents. Include test cases, groundedness checks, latency measurements, and a decision rubric.' },
];
export const workflowExamples = [
  { label: 'Research & review', name: 'Research and review', description: 'Develop a brief, then independently review its assumptions.', default_input: inferenceExamples[2].input, steps: [
    { id: 'research', name: 'Research brief', kind: 'model', prompt: 'Create a structured research brief for this request. Identify assumptions.\n\n{{input}}' },
    { id: 'review', name: 'Review & next steps', kind: 'model', prompt: 'Review this brief. Identify gaps and end with actionable next steps.\n\n{{previous}}' },
  ] },
  { label: 'Customer priorities', name: 'Customer priorities', description: 'Turn feedback into an actionable delivery plan.', default_input: inferenceExamples[1].input, steps: [
    { id: 'analysis', name: 'Understand the feedback', kind: 'model', prompt: 'Analyze the supplied feedback. Group themes, label uncertainty, and rank issues.\n\n{{input}}' },
    { id: 'plan', name: 'Create the delivery plan', kind: 'model', prompt: 'Create an implementation plan from this analysis. Include owners to assign, success measures, and risks.\n\n{{previous}}' },
  ] },
  { label: 'Blockchain briefing', name: 'Blockchain state briefing', description: 'Read a real smart contract, then explain the observed result.', default_input: 'Explain the observed token supply and identify what additional data would be useful.', steps: [
    { id: 'chain', name: 'Read OPG token supply', kind: 'contract', network: 'base', address: '0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB', signature: 'function totalSupply() view returns (uint256)', args: [] },
    { id: 'brief', name: 'Explain the observation', kind: 'model', prompt: 'Explain the supplied blockchain observation without inventing a token price or interpreting raw supply as circulating supply.\n\nUser goal: {{input}}\nObserved state: {{previous}}' },
  ] },
];
