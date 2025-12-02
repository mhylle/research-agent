import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SparklineData {
  values: number[];
  color?: string;
  showDelta?: boolean;
  deltaLabel?: string;
}

@Component({
  selector: 'app-sparkline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sparkline-container" [title]="tooltipText()">
      <svg
        class="sparkline-svg"
        [attr.width]="width"
        [attr.height]="height"
        viewBox="0 0 40 16"
        preserveAspectRatio="none">
        <!-- Gradient fill -->
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" [attr.stop-color]="lineColor()" stop-opacity="0.3" />
            <stop offset="100%" [attr.stop-color]="lineColor()" stop-opacity="0.05" />
          </linearGradient>
        </defs>

        <!-- Fill area -->
        <path
          [attr.d]="fillPath()"
          [attr.fill]="'url(#' + gradientId + ')'"
          class="sparkline-fill" />

        <!-- Line path -->
        <path
          [attr.d]="linePath()"
          [attr.stroke]="lineColor()"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="sparkline-line" />
      </svg>

      <!-- Delta indicator -->
      <div class="sparkline-delta" *ngIf="showDelta && delta() !== null">
        <span class="delta-icon" [class.positive]="delta()! > 0" [class.negative]="delta()! < 0">
          {{ delta()! > 0 ? '↑' : delta()! < 0 ? '↓' : '=' }}
        </span>
        <span class="delta-value" [class.positive]="delta()! > 0" [class.negative]="delta()! < 0">
          {{ Math.abs(delta()!).toFixed(0) }}% {{ deltaLabel || 'change' }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .sparkline-container {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      cursor: help;
    }

    .sparkline-svg {
      display: block;
    }

    .sparkline-line {
      animation: drawLine 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
    }

    @keyframes drawLine {
      to {
        stroke-dashoffset: 0;
      }
    }

    .sparkline-fill {
      opacity: 0;
      animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards;
    }

    @keyframes fadeIn {
      to {
        opacity: 1;
      }
    }

    .sparkline-delta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1;
    }

    .delta-icon {
      font-size: 12px;
      font-weight: 600;
    }

    .delta-icon.positive,
    .delta-value.positive {
      color: #4d7c0f;
    }

    .delta-icon.negative,
    .delta-value.negative {
      color: #ea580c;
    }

    .delta-value {
      color: #64748b;
    }
  `]
})
export class SparklineComponent implements OnInit {
  @Input() data: number[] = [];
  @Input() color?: string;
  @Input() width: number = 40;
  @Input() height: number = 16;
  @Input() showDelta: boolean = true;
  @Input() deltaLabel?: string;

  protected readonly Math = Math;

  gradientId = `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`;

  lineColor = computed(() => {
    if (this.color) return this.color;

    const deltaValue = this.delta();
    if (deltaValue === null) return '#64748b';
    if (deltaValue > 0) return '#4d7c0f'; // Moss
    if (deltaValue < 0) return '#ea580c'; // Clay
    return '#64748b'; // Slate
  });

  delta = computed(() => {
    if (this.data.length < 2) return null;
    const first = this.data[0];
    const last = this.data[this.data.length - 1];
    return last - first;
  });

  tooltipText = computed(() => {
    if (this.data.length === 0) return '';
    if (this.data.length === 1) return `${this.data[0].toFixed(0)}%`;

    const attempts = this.data.map((v, i) => `Attempt ${i + 1}: ${v.toFixed(0)}%`).join(' → ');
    return attempts;
  });

  linePath = computed(() => {
    if (this.data.length === 0) return '';

    const points = this.normalizePoints();
    if (points.length === 0) return '';

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`;
    }

    return path;
  });

  fillPath = computed(() => {
    if (this.data.length === 0) return '';

    const points = this.normalizePoints();
    if (points.length === 0) return '';

    let path = `M ${points[0].x},16`;
    path += ` L ${points[0].x},${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`;
    }

    path += ` L ${points[points.length - 1].x},16`;
    path += ' Z';

    return path;
  });

  ngOnInit(): void {
    // Validation
    if (this.data.length === 0) {
      console.warn('Sparkline: No data provided');
    }
  }

  private normalizePoints(): { x: number; y: number }[] {
    if (this.data.length === 0) return [];

    const viewWidth = 40;
    const viewHeight = 16;
    const padding = 1;

    const min = Math.min(...this.data);
    const max = Math.max(...this.data);
    const range = max - min || 1;

    const xStep = this.data.length === 1 ? 0 : viewWidth / (this.data.length - 1);

    return this.data.map((value, index) => ({
      x: index * xStep,
      y: viewHeight - padding - ((value - min) / range) * (viewHeight - 2 * padding)
    }));
  }
}
