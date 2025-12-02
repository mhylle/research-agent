import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ExecutionMetrics, TokenMetric } from '../../../models';

@Component({
  selector: 'app-token-cost-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div class="token-cost-card">
      <div class="card-header">
        <h3 class="card-title">Token Usage</h3>
        @if (isLoading) {
          <span class="loading-badge">Loading...</span>
        }
      </div>

      @if (!metrics && !isLoading) {
        <div class="no-data">
          <span class="no-data-icon">📊</span>
          <p>No token data available</p>
        </div>
      }

      @if (metrics) {
        <div class="metrics-content">
          <!-- Total Tokens -->
          <div class="total-section">
            <div class="total-label">Total Tokens</div>
            <div class="total-value">{{ totalTokens() | number }}</div>
            @if (estimatedCost() > 0) {
              <div class="cost-estimate">
                ~<span class="dollar">$</span>{{ estimatedCost().toFixed(4) }} estimated
              </div>
            }
          </div>

          <!-- Token Breakdown by Tool -->
          @if (hasTokenBreakdown()) {
            <div class="breakdown-section">
              <div class="section-title">By Tool</div>
              <div class="breakdown-bars">
                @for (item of tokenBreakdownItems(); track item.tool) {
                  <div class="bar-item">
                    <div class="bar-header">
                      <span class="bar-label">{{ formatToolName(item.tool) }}</span>
                      <span class="bar-value">{{ item.tokens | number }}</span>
                    </div>
                    <div class="bar-container">
                      <div
                        class="bar-fill"
                        [style.width.%]="item.percentage"
                        [style.backgroundColor]="getToolColor(item.tool)">
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Token Heavy Steps -->
          @if (metrics.tokenHeavySteps && metrics.tokenHeavySteps.length > 0) {
            <div class="heavy-steps-section">
              <div class="section-title">Token-Heavy Steps</div>
              <div class="steps-list">
                @for (step of metrics.tokenHeavySteps.slice(0, 3); track step.stepId) {
                  <div class="step-item">
                    <span class="step-icon">{{ getToolIcon(step.toolName) }}</span>
                    <span class="step-name">{{ formatToolName(step.toolName) }}</span>
                    <span class="step-tokens">{{ step.tokens | number }} tokens</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Duration by Phase -->
          @if (hasDurationByPhase()) {
            <div class="duration-section">
              <div class="section-title">Duration by Phase</div>
              <div class="duration-list">
                @for (item of durationByPhaseItems(); track item.phase) {
                  <div class="duration-item">
                    <span class="duration-label">{{ item.phase }}</span>
                    <span class="duration-value">{{ formatDuration(item.duration) }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .token-cost-card {
      background: #f5f5f4;
      border-radius: 12px;
      padding: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .card-title {
      font-family: 'Merriweather', serif;
      font-size: 1.125rem;
      font-weight: 600;
      color: #292524;
      margin: 0;
    }

    .loading-badge {
      font-size: 0.75rem;
      color: #64748b;
      padding: 4px 8px;
      background: #e7e5e4;
      border-radius: 4px;
    }

    .no-data {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #64748b;
    }

    .no-data-icon {
      font-size: 2rem;
      margin-bottom: 8px;
    }

    .no-data p {
      margin: 0;
      font-size: 0.875rem;
    }

    .metrics-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .total-section {
      text-align: center;
      padding: 16px;
      background: #fff;
      border-radius: 8px;
    }

    .total-label {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .total-value {
      font-size: 2rem;
      font-weight: 700;
      color: #292524;
      line-height: 1.2;
    }

    .cost-estimate {
      font-size: 0.75rem;
      color: #4d7c0f;
      margin-top: 4px;
    }

    .section-title {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .breakdown-section {
      padding: 12px;
      background: #fff;
      border-radius: 8px;
    }

    .breakdown-bars {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .bar-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .bar-label {
      font-size: 0.75rem;
      color: #44403c;
      font-weight: 500;
    }

    .bar-value {
      font-size: 0.75rem;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
    }

    .bar-container {
      height: 6px;
      background: #e7e5e4;
      border-radius: 3px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease-out;
    }

    .heavy-steps-section {
      padding: 12px;
      background: #fff;
      border-radius: 8px;
    }

    .steps-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #faf9f7;
      border-radius: 6px;
    }

    .step-icon {
      font-size: 1rem;
    }

    .step-name {
      flex: 1;
      font-size: 0.875rem;
      color: #44403c;
    }

    .step-tokens {
      font-size: 0.75rem;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
    }

    .duration-section {
      padding: 12px;
      background: #fff;
      border-radius: 8px;
    }

    .duration-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .duration-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      background: #faf9f7;
      border-radius: 4px;
    }

    .duration-label {
      font-size: 0.75rem;
      color: #44403c;
    }

    .duration-value {
      font-size: 0.75rem;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
    }
  `]
})
export class TokenCostCardComponent {
  @Input() metrics: ExecutionMetrics | null = null;
  @Input() isLoading: boolean = false;

  // Approximate cost per 1M tokens for Claude (varies by model)
  private readonly COST_PER_MILLION_TOKENS = 3.0;

  totalTokens = computed(() => {
    if (!this.metrics?.tokenBreakdown) return 0;
    return Object.values(this.metrics.tokenBreakdown).reduce((sum, val) => sum + val, 0);
  });

  estimatedCost = computed(() => {
    const tokens = this.totalTokens();
    return (tokens / 1_000_000) * this.COST_PER_MILLION_TOKENS;
  });

  hasTokenBreakdown = () => {
    if (!this.metrics?.tokenBreakdown) return false;
    return Object.keys(this.metrics.tokenBreakdown).length > 0;
  };

  tokenBreakdownItems = computed(() => {
    if (!this.metrics?.tokenBreakdown) return [];

    const total = this.totalTokens();
    const items = Object.entries(this.metrics.tokenBreakdown)
      .map(([tool, tokens]) => ({
        tool,
        tokens,
        percentage: total > 0 ? (tokens / total) * 100 : 0
      }))
      .sort((a, b) => b.tokens - a.tokens);

    return items;
  });

  hasDurationByPhase = () => {
    if (!this.metrics?.durationByPhase) return false;
    return Object.keys(this.metrics.durationByPhase).length > 0;
  };

  durationByPhaseItems = computed(() => {
    if (!this.metrics?.durationByPhase) return [];

    return Object.entries(this.metrics.durationByPhase)
      .map(([phase, duration]) => ({
        phase: this.formatPhaseName(phase),
        duration
      }))
      .sort((a, b) => b.duration - a.duration);
  });

  formatToolName(toolName: string): string {
    const names: Record<string, string> = {
      'tavily_search': 'Tavily Search',
      'tavilysearch': 'Tavily Search',
      'web_fetch': 'Web Fetch',
      'webfetch': 'Web Fetch',
      'duckduckgo_search': 'DuckDuckGo Search',
      'brave_search': 'Brave Search',
      'knowledge_search': 'Knowledge Search',
      'synthesize': 'Synthesize',
      'llm': 'LLM',
      'unknown': 'Other'
    };

    return names[toolName.toLowerCase()] || toolName.charAt(0).toUpperCase() + toolName.slice(1);
  }

  formatPhaseName(phase: string): string {
    // Remove underscores and capitalize each word
    return phase
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  getToolColor(toolName: string): string {
    const colors: Record<string, string> = {
      'tavily_search': '#3b82f6',
      'tavilysearch': '#3b82f6',
      'web_fetch': '#8b5cf6',
      'webfetch': '#8b5cf6',
      'duckduckgo_search': '#f59e0b',
      'brave_search': '#ef4444',
      'knowledge_search': '#10b981',
      'synthesize': '#6366f1',
      'llm': '#4d7c0f',
      'unknown': '#64748b'
    };

    return colors[toolName.toLowerCase()] || '#64748b';
  }

  getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      'tavily_search': '🔎',
      'tavilysearch': '🔎',
      'web_fetch': '🌐',
      'webfetch': '🌐',
      'duckduckgo_search': '🦆',
      'brave_search': '🦁',
      'knowledge_search': '📚',
      'synthesize': '✨',
      'llm': '🤖',
      'unknown': '🔧'
    };

    return icons[toolName.toLowerCase()] || '🔧';
  }
}
