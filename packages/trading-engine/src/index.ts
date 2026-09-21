import { ToolRegistry } from './framework.js';
import { positionSizeTool, rMultipleTool } from './risk.js';
import { smaTool, syntheticSeriesTool } from './marketData.js';
import { portfolioComposeTool } from './portfolio.js';

/** Build the default Phase 1 registry (all deterministic, side-effect free). */
export function defaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(positionSizeTool);
  registry.register(rMultipleTool);
  registry.register(syntheticSeriesTool);
  registry.register(smaTool);
  registry.register(portfolioComposeTool);
  return registry;
}

/*
 * Phase 5.5 adds `portfolio.compose` to the registry rather than calling the module
 * directly from the agent, and that is the point: a calculation the model may ask about
 * has to be reachable through the permission-checked tool path, so the capability it
 * needs is declared in the permission table and the tool cannot run without a grant. A
 * model that could reach the arithmetic by another route would make the permission table
 * decorative.
 */
export {
  analysePortfolio,
  computePortfolioMetrics,
  derivePortfolioInsights,
  portfolioComposeTool,
  weightSetOf,
  CONCENTRATION_ELEVATED_PERCENT,
  CONCENTRATION_WATCH_PERCENT,
  HHI_ELEVATED,
  HHI_WATCH,
  SHORT_HORIZON_CONCENTRATION_PERCENT,
} from './portfolio.js';
export type { InsightInput, PortfolioAnalysis, PortfolioComposeInput } from './portfolio.js';
