import { Component, Input, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

export interface RadarDataPoint {
  axis: string;
  value: number;
}

export interface RadarSeries {
  name: string;
  data: RadarDataPoint[];
  color: string;
}

interface DimensionDescription {
  [key: string]: string;
}

const DIMENSION_DESCRIPTIONS: DimensionDescription = {
  'Intent Alignment': 'How well the plan captures the user\'s original intent',
  'Query Coverage': 'Whether search queries address all aspects of the question',
  'Query Accuracy': 'Precision of search queries matching the topic',
  'Scope': 'Appropriateness of research scope for the question',
  'Faithfulness': 'How accurately the answer reflects source material',
  'Accuracy': 'Factual correctness of the generated answer',
  'Answer Relevance': 'How directly the answer addresses the question',
  'Focus': 'Whether the answer stays on topic',
  'Completeness': 'Coverage of all relevant aspects',
  'Depth': 'Level of detail and analysis provided',
  'Context Recall': 'Ability to find relevant information',
  'Context Precision': 'Accuracy of retrieved context',
  'Source Quality': 'Credibility and reliability of sources',
  'Coverage Completeness': 'How thoroughly sources cover the topic',
  'Actionable Information': 'Practical usefulness of retrieved content'
};

@Component({
  selector: 'app-radar-chart',
  imports: [CommonModule],
  template: `
    <div class="radar-chart-container">
      <svg #radarSvg></svg>
      <div class="radar-tooltip" #tooltip></div>
      <div class="radar-legend" *ngIf="showLegend">
        <div class="legend-item" *ngFor="let series of series">
          <span class="legend-color" [style.background-color]="series.color"></span>
          <span class="legend-label">{{ series.name }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .radar-chart-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      position: relative;
    }

    svg {
      width: 100%;
      height: 100%;
    }

    .radar-tooltip {
      position: absolute;
      background: #292524;
      color: #f5f5f4;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      font-family: Inter, sans-serif;
      max-width: 250px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 1000;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .radar-tooltip.visible {
      opacity: 1;
    }

    .radar-legend {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-label {
      color: var(--text-secondary);
    }
  `]
})
export class RadarChartComponent implements OnInit, OnChanges {
  @Input() series: RadarSeries[] = [];
  @Input() width: number = 300;
  @Input() height: number = 300;
  @Input() showLegend: boolean = true;
  @Input() maxValue: number = 100;
  @Input() levels: number = 5;

  @ViewChild('radarSvg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip', { static: true }) tooltipRef!: ElementRef<HTMLDivElement>;

  private tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined> | null = null;

  ngOnInit(): void {
    this.tooltip = d3.select(this.tooltipRef.nativeElement);
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['series'] || changes['width'] || changes['height'] || changes['maxValue']) {
      this.renderChart();
    }
  }

  private renderChart(): void {
    if (!this.series || this.series.length === 0) return;

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const width = this.width - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;
    const radius = Math.min(width, height) / 2;

    const g = svg
      .attr('width', this.width)
      .attr('height', this.height)
      .append('g')
      .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

    // Get all axes from first series
    const allAxes = this.series[0]?.data.map(d => d.axis) || [];
    const total = allAxes.length;
    const angleSlice = (Math.PI * 2) / total;

    // Scale for the radius
    const rScale = d3.scaleLinear()
      .domain([0, this.maxValue])
      .range([0, radius]);

    // Draw circular grid
    for (let i = 0; i < this.levels; i++) {
      const levelFactor = radius * ((i + 1) / this.levels);

      g.append('circle')
        .attr('r', levelFactor)
        .style('fill', 'none')
        .style('stroke', '#d6d3d1')
        .style('stroke-width', '1px')
        .style('opacity', 0.5);
    }

    // Create axis line group for hover effects
    const axisGroup = g.append('g').attr('class', 'axis-group');

    // Draw axis lines
    allAxes.forEach((axis, i) => {
      axisGroup.append('line')
        .attr('class', `axis-line-${i}`)
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', rScale(this.maxValue * 1.1) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr('y2', rScale(this.maxValue * 1.1) * Math.sin(angleSlice * i - Math.PI / 2))
        .style('stroke', '#d6d3d1')
        .style('stroke-width', '1px')
        .style('transition', 'stroke 0.2s ease, opacity 0.2s ease');
    });

    // Create label group for hover effects
    const labelGroup = g.append('g').attr('class', 'label-group');

    // Draw axis labels
    allAxes.forEach((axis, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = rScale(this.maxValue * 1.25) * Math.cos(angle);
      const y = rScale(this.maxValue * 1.25) * Math.sin(angle);

      labelGroup.append('text')
        .attr('class', `axis-label-${i}`)
        .attr('x', x)
        .attr('y', y)
        .attr('dy', '0.35em')
        .style('font-size', '12px')
        .style('font-weight', '500')
        .style('fill', '#292524')
        .attr('text-anchor', 'middle')
        .style('transition', 'fill 0.2s ease, opacity 0.2s ease')
        .text(axis);
    });

    // Draw data series
    this.series.forEach(series => {
      const coordinates = series.data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        return {
          x: rScale(d.value) * Math.cos(angle),
          y: rScale(d.value) * Math.sin(angle),
          value: d.value,
          axis: d.axis,
          axisIndex: i
        };
      });

      // Draw filled area
      const radarLine = d3.line<any>()
        .x(d => d.x)
        .y(d => d.y)
        .curve(d3.curveLinearClosed);

      // Create path with animation
      const path = g.append('path')
        .datum(coordinates)
        .attr('d', radarLine)
        .style('fill', series.color)
        .style('fill-opacity', 0)
        .style('stroke', series.color)
        .style('stroke-width', '2px')
        .style('opacity', 0);

      // Animate path
      path.transition()
        .duration(500)
        .ease(d3.easeQuadOut)
        .style('fill-opacity', 0.15)
        .style('opacity', 1);

      // Sanitize series name for CSS class usage
      const sanitizedName = series.name.replace(/[^a-zA-Z0-9-_]/g, '-');

      // Draw data points with animation and hover effects
      const dots = g.selectAll(`.dot-${sanitizedName}`)
        .data(coordinates)
        .enter()
        .append('circle')
        .attr('class', `dot-${sanitizedName}`)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', 0)
        .style('fill', series.color)
        .style('stroke', '#fff')
        .style('stroke-width', '2px')
        .style('cursor', 'pointer')
        .style('transition', 'r 0.2s ease');

      // Animate dots
      dots.transition()
        .duration(500)
        .delay((d, i) => i * 50)
        .ease(d3.easeQuadOut)
        .attr('r', 4);

      // Add hover effects
      dots
        .on('mouseenter', (event, d: any) => {
          this.showTooltip(event, d, series.name);
          this.highlightAxis(d.axisIndex, true);
          d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr('r', 6);
        })
        .on('mousemove', (event) => {
          this.updateTooltipPosition(event);
        })
        .on('mouseleave', (event, d: any) => {
          this.hideTooltip();
          this.highlightAxis(d.axisIndex, false);
          d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr('r', 4);
        });
    });
  }

  private showTooltip(event: MouseEvent, data: any, seriesName: string): void {
    if (!this.tooltip) return;

    const description = DIMENSION_DESCRIPTIONS[data.axis] || 'No description available';
    const passed = data.value >= 70;
    const indicator = passed ?
      '<span style="color: #10b981; font-size: 1.2em;">✓</span>' :
      '<span style="color: #ef4444; font-size: 1.2em;">✗</span>';

    this.tooltip
      .html(`
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 1rem;">${data.axis}</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="font-size: 1.25rem; font-weight: 600;">${data.value.toFixed(0)}%</span>
          ${indicator}
        </div>
        <div style="color: #d6d3d1; font-size: 0.8125rem;">
          ${description}
        </div>
      `)
      .classed('visible', true);

    this.updateTooltipPosition(event);
  }

  private updateTooltipPosition(event: MouseEvent): void {
    if (!this.tooltip) return;

    const tooltipNode = this.tooltip.node();
    if (!tooltipNode) return;

    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;
    const containerRect = this.svgRef.nativeElement.getBoundingClientRect();

    let left = event.clientX - containerRect.left + 10;
    let top = event.clientY - containerRect.top - tooltipHeight / 2;

    // Keep tooltip within bounds
    if (left + tooltipWidth > containerRect.width) {
      left = event.clientX - containerRect.left - tooltipWidth - 10;
    }
    if (top < 0) {
      top = 10;
    }
    if (top + tooltipHeight > containerRect.height) {
      top = containerRect.height - tooltipHeight - 10;
    }

    this.tooltip
      .style('left', `${left}px`)
      .style('top', `${top}px`);
  }

  private hideTooltip(): void {
    if (!this.tooltip) return;
    this.tooltip.classed('visible', false);
  }

  private highlightAxis(axisIndex: number, highlight: boolean): void {
    const svg = d3.select(this.svgRef.nativeElement);

    if (highlight) {
      // Dim other axes
      svg.selectAll('.axis-group line')
        .style('opacity', (d, i) => i === axisIndex ? 1 : 0.3);

      svg.selectAll('.label-group text')
        .style('opacity', (d, i) => i === axisIndex ? 1 : 0.3)
        .style('fill', (d, i) => i === axisIndex ? '#78716c' : '#292524');
    } else {
      // Reset all axes
      svg.selectAll('.axis-group line')
        .style('opacity', 1);

      svg.selectAll('.label-group text')
        .style('opacity', 1)
        .style('fill', '#292524');
    }
  }
}
