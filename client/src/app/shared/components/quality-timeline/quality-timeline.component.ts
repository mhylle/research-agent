import { Component, Input, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

export interface TimelinePhase {
  name: string;
  attempts: number;
  scores: number[];
  avgScore: number;
  duration: number;
  timestamp: string;
  status: 'success' | 'failed';
}

export interface TimelineMilestone {
  timestamp: string;
  progress: number;
  description: string;
}

export interface TimelineData {
  phases: TimelinePhase[];
  milestones: TimelineMilestone[];
}

@Component({
  selector: 'app-quality-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-container" [class.collapsed]="collapsed()">
      <div class="timeline-header">
        <h3>Quality Evolution Timeline</h3>
        <button class="toggle-btn" (click)="toggleCollapse()">
          {{ collapsed() ? '▼' : '▲' }}
        </button>
      </div>

      @if (!collapsed()) {
        <div class="timeline-content">
          @if (!data) {
            <div class="no-data">
              <span class="icon">📊</span>
              <p>No timeline data available</p>
            </div>
          } @else {
            <svg #timelineSvg class="timeline-svg"></svg>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .timeline-container {
      background: #f5f5f4;
      border-radius: 1rem;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .timeline-container.collapsed {
      padding: 1rem 1.5rem;
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .timeline-container.collapsed .timeline-header {
      margin-bottom: 0;
    }

    .timeline-header h3 {
      font-family: 'Merriweather', serif;
      font-size: 1.25rem;
      color: #292524;
      margin: 0;
    }

    .toggle-btn {
      background: #e7e5e4;
      border: none;
      border-radius: 0.5rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
      color: #292524;
      font-size: 1rem;
      transition: background-color 0.2s;
    }

    .toggle-btn:hover {
      background: #d6d3d1;
    }

    .timeline-content {
      min-height: 200px;
    }

    .timeline-svg {
      width: 100%;
      height: 250px;
      overflow: visible;
    }

    .no-data {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: #64748b;
    }

    .no-data .icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .no-data p {
      margin: 0;
      font-size: 0.875rem;
    }

    /* D3 Styles */
    :host ::ng-deep .timeline-line {
      stroke: #d6d3d1;
      stroke-width: 3px;
      fill: none;
    }

    :host ::ng-deep .phase-node {
      cursor: pointer;
      transition: all 0.2s;
    }

    :host ::ng-deep .phase-node:hover .phase-circle {
      r: 22;
    }

    :host ::ng-deep .phase-circle {
      stroke: #fff;
      stroke-width: 3px;
      transition: r 0.2s;
    }

    :host ::ng-deep .phase-circle.success {
      fill: #4d7c0f;
    }

    :host ::ng-deep .phase-circle.failed {
      fill: #ea580c;
    }

    :host ::ng-deep .phase-label {
      font-family: 'Merriweather', serif;
      font-size: 0.875rem;
      font-weight: 600;
      fill: #292524;
      text-anchor: middle;
    }

    :host ::ng-deep .phase-detail {
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      fill: #64748b;
      text-anchor: middle;
    }

    :host ::ng-deep .milestone-marker {
      fill: #64748b;
      stroke: #fff;
      stroke-width: 2px;
    }

    :host ::ng-deep .sparkline {
      stroke-width: 2px;
      fill: none;
    }

    :host ::ng-deep .sparkline.improving {
      stroke: #4d7c0f;
    }

    :host ::ng-deep .sparkline.declining {
      stroke: #ea580c;
    }

    :host ::ng-deep .tooltip {
      position: absolute;
      background: #292524;
      color: #f5f5f4;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 250px;
    }

    :host ::ng-deep .tooltip .tooltip-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #f5f5f4;
    }

    :host ::ng-deep .tooltip .tooltip-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.25rem;
    }

    :host ::ng-deep .tooltip .tooltip-label {
      color: #a8a29e;
    }

    :host ::ng-deep .tooltip .tooltip-value {
      font-weight: 500;
      margin-left: 0.5rem;
    }
  `]
})
export class QualityTimelineComponent implements OnInit, OnChanges {
  @Input() data: TimelineData | null = null;
  @ViewChild('timelineSvg', { static: false }) svgRef?: ElementRef<SVGSVGElement>;

  collapsed = signal(false);

  ngOnInit(): void {
    // Defer rendering to ensure ViewChild is initialized
    setTimeout(() => {
      if (this.data) {
        this.renderTimeline();
      }
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      // Defer rendering to ensure ViewChild is initialized
      setTimeout(() => {
        this.renderTimeline();
      }, 0);
    }
  }

  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }

  private renderTimeline(): void {
    if (!this.svgRef) {
      console.warn('QualityTimeline: SVG ref not available');
      return;
    }
    if (!this.data) {
      console.warn('QualityTimeline: No data provided');
      return;
    }
    if (this.data.phases.length === 0) {
      console.warn('QualityTimeline: No phases in data');
      return;
    }

    console.log('QualityTimeline: Rendering with data:', this.data);

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();

    const margin = { top: 60, right: 40, bottom: 40, left: 40 };
    const width = this.svgRef.nativeElement.clientWidth - margin.left - margin.right;
    const height = 250 - margin.top - margin.bottom;

    const g = svg
      .attr('width', this.svgRef.nativeElement.clientWidth)
      .attr('height', 250)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Create scale for x-axis (timeline)
    const phases = this.data.phases;
    const xScale = d3.scaleLinear()
      .domain([0, phases.length - 1])
      .range([0, width]);

    // Draw main timeline line
    g.append('line')
      .attr('class', 'timeline-line')
      .attr('x1', 0)
      .attr('y1', height / 2)
      .attr('x2', width)
      .attr('y2', height / 2);

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute');

    // Draw phase nodes
    phases.forEach((phase, i) => {
      const x = xScale(i);
      const y = height / 2;

      const phaseNode = g.append('g')
        .attr('class', 'phase-node')
        .attr('transform', `translate(${x}, ${y})`);

      // Phase circle
      phaseNode.append('circle')
        .attr('class', `phase-circle ${phase.status}`)
        .attr('r', 20)
        .on('mouseover', (event: MouseEvent) => {
          tooltip.transition().duration(200).style('opacity', 1);
          tooltip.html(this.formatTooltip(phase))
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', () => {
          tooltip.transition().duration(200).style('opacity', 0);
        });

      // Phase icon (using text for simplicity)
      const icon = i === 0 ? '🧠' : i === 1 ? '🔍' : '✨';
      phaseNode.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .style('font-size', '1rem')
        .text(icon);

      // Phase label
      phaseNode.append('text')
        .attr('class', 'phase-label')
        .attr('y', -35)
        .text(phase.name);

      // Phase details
      phaseNode.append('text')
        .attr('class', 'phase-detail')
        .attr('y', 45)
        .text(`${phase.attempts} attempt${phase.attempts > 1 ? 's' : ''}`);

      phaseNode.append('text')
        .attr('class', 'phase-detail')
        .attr('y', 60)
        .text(`Avg: ${Math.round(phase.avgScore * 100)}%`);

      // Draw sparkline if multiple attempts
      if (phase.scores.length > 1) {
        this.drawSparkline(phaseNode, phase.scores, 30, 15);
      }

      // Draw connecting line to next phase
      if (i < phases.length - 1) {
        const nextX = xScale(i + 1);
        g.append('line')
          .attr('class', 'timeline-line')
          .attr('x1', x + 20)
          .attr('y1', y)
          .attr('x2', nextX - 20)
          .attr('y2', y);

        // Duration label
        g.append('text')
          .attr('class', 'phase-detail')
          .attr('x', (x + nextX) / 2)
          .attr('y', y - 10)
          .attr('text-anchor', 'middle')
          .text(this.formatDuration(phase.duration));
      }
    });

    // Draw milestone markers
    if (this.data.milestones && this.data.milestones.length > 0) {
      this.data.milestones.forEach(milestone => {
        const milestoneIndex = this.getMilestonePosition(milestone, phases);
        if (milestoneIndex >= 0) {
          const x = xScale(milestoneIndex);
          const y = height / 2;

          g.append('circle')
            .attr('class', 'milestone-marker')
            .attr('cx', x)
            .attr('cy', y + 35)
            .attr('r', 4)
            .on('mouseover', (event: MouseEvent) => {
              tooltip.transition().duration(200).style('opacity', 1);
              tooltip.html(`
                <div class="tooltip-title">Milestone</div>
                <div class="tooltip-row">
                  <span class="tooltip-label">${milestone.description}</span>
                </div>
                <div class="tooltip-row">
                  <span class="tooltip-label">Progress:</span>
                  <span class="tooltip-value">${milestone.progress}%</span>
                </div>
              `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
              tooltip.transition().duration(200).style('opacity', 0);
            });
        }
      });
    }
  }

  private drawSparkline(parent: d3.Selection<SVGGElement, unknown, null, undefined>, scores: number[], width: number, height: number): void {
    const xScale = d3.scaleLinear()
      .domain([0, scores.length - 1])
      .range([-width / 2, width / 2]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([height / 2, -height / 2]);

    const line = d3.line<number>()
      .x((d, i) => xScale(i))
      .y(d => yScale(d));

    const isImproving = scores[scores.length - 1] > scores[0];

    parent.append('path')
      .datum(scores)
      .attr('class', `sparkline ${isImproving ? 'improving' : 'declining'}`)
      .attr('d', line)
      .attr('transform', `translate(0, 75)`);
  }

  private formatTooltip(phase: TimelinePhase): string {
    return `
      <div class="tooltip-title">${phase.name}</div>
      <div class="tooltip-row">
        <span class="tooltip-label">Attempts:</span>
        <span class="tooltip-value">${phase.attempts}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Avg Score:</span>
        <span class="tooltip-value">${Math.round(phase.avgScore * 100)}%</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Duration:</span>
        <span class="tooltip-value">${this.formatDuration(phase.duration)}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Status:</span>
        <span class="tooltip-value">${phase.status === 'success' ? '✅ Success' : '❌ Failed'}</span>
      </div>
    `;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  private getMilestonePosition(milestone: TimelineMilestone, phases: TimelinePhase[]): number {
    // Find which phase this milestone belongs to based on timestamp
    const milestoneTime = new Date(milestone.timestamp).getTime();

    for (let i = 0; i < phases.length; i++) {
      const phaseTime = new Date(phases[i].timestamp).getTime();
      const nextPhaseTime = i < phases.length - 1
        ? new Date(phases[i + 1].timestamp).getTime()
        : Infinity;

      if (milestoneTime >= phaseTime && milestoneTime < nextPhaseTime) {
        return i;
      }
    }

    return -1;
  }
}
