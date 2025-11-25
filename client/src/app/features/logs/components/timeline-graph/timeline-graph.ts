import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import type { GraphData, GraphNode, GraphEdge } from '../../../../models';

type ViewMode = 'gantt' | 'timeline' | 'dependencies';

@Component({
  selector: 'app-timeline-graph',
  imports: [CommonModule, FormsModule],
  templateUrl: './timeline-graph.html',
  styleUrls: ['./timeline-graph.scss'],
})
export class TimelineGraphComponent implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('timelineSvg', { static: false }) svgElement!: ElementRef<SVGElement>;
  @Input() graphData!: GraphData;
  @Input() width = 1200;
  @Input() height = 600;

  viewMode: ViewMode = 'gantt';
  selectedNode: GraphNode | null = null;
  hoveredNode: GraphNode | null = null;
  pinnedNode: GraphNode | null = null;
  tooltipX = 0;
  tooltipY = 0;

  private svg: any;
  private g: any;
  private zoom: any;
  private xScale: any;
  private yScale: any;

  private readonly margins = { top: 50, right: 50, bottom: 50, left: 150 };

  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    if (this.graphData) {
      this.initializeSvg();
      this.renderVisualization();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['graphData'] && !changes['graphData'].firstChange) {
      this.renderVisualization();
    }
  }

  private initializeSvg(): void {
    // Clear any existing SVG content
    d3.select(this.svgElement.nativeElement).selectAll('*').remove();

    this.svg = d3
      .select(this.svgElement.nativeElement)
      .attr('width', this.width)
      .attr('height', this.height);

    // Create main group for zoom/pan
    this.g = this.svg.append('g');

    // Setup zoom behavior
    this.zoom = d3
      .zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event: any) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Add arrow marker definition
    this.svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .attr('refX', 9)
      .attr('refY', 3)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3, 0 6')
      .attr('fill', '#666');
  }

  private renderVisualization(): void {
    if (!this.graphData || !this.g) return;

    // Clear previous visualization
    this.g.selectAll('*').remove();

    switch (this.viewMode) {
      case 'gantt':
        this.renderGanttView();
        break;
      case 'timeline':
        this.renderTimelineView();
        break;
      case 'dependencies':
        this.renderDependenciesView();
        break;
    }
  }

  private renderGanttView(): void {
    const nodes = this.graphData.nodes;
    if (nodes.length === 0) return;

    // Calculate time domain
    const times = nodes.flatMap((n) => [
      n.startTime.getTime(),
      n.endTime ? n.endTime.getTime() : n.startTime.getTime(),
    ]);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    // Create time scale (X-axis)
    const innerWidth = this.width - this.margins.left - this.margins.right;
    const innerHeight = this.height - this.margins.top - this.margins.bottom;

    this.xScale = d3
      .scaleTime()
      .domain([new Date(minTime), new Date(maxTime)])
      .range([this.margins.left, this.width - this.margins.right]);

    // Create node scale (Y-axis)
    this.yScale = d3
      .scaleBand()
      .domain(nodes.map((n) => n.id))
      .range([this.margins.top, this.height - this.margins.bottom])
      .padding(0.2);

    // Render axes
    this.renderAxes();

    // Render edges first (so they appear behind nodes)
    this.renderEdges();

    // Render node bars
    this.renderNodeBars();

    // Render labels
    this.renderLabels();
  }

  private renderAxes(): void {
    // X-axis (time)
    const xAxis = d3.axisBottom(this.xScale).ticks(10).tickFormat(d3.timeFormat('%H:%M:%S') as any);

    this.g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${this.height - this.margins.bottom})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '12px');

    // Y-axis (nodes)
    this.g
      .append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${this.margins.left}, 0)`)
      .call(d3.axisLeft(this.yScale).tickFormat((d: any) => {
        const node = this.graphData.nodes.find(n => n.id === d);
        return node ? node.name : d;
      }))
      .selectAll('text')
      .style('font-size', '12px');
  }

  private renderNodeBars(): void {
    const nodeGroups = this.g
      .selectAll('.node-bar-group')
      .data(this.graphData.nodes)
      .enter()
      .append('g')
      .attr('class', 'node-bar-group')
      .attr('transform', (d: GraphNode) => `translate(0, ${this.yScale(d.id)})`);

    // Draw bars
    nodeGroups
      .append('rect')
      .attr('class', 'node-bar')
      .attr('x', (d: GraphNode) => this.xScale(d.startTime))
      .attr('width', (d: GraphNode) => {
        if (!d.endTime) return 20;
        return this.xScale(d.endTime) - this.xScale(d.startTime);
      })
      .attr('height', this.yScale.bandwidth())
      .attr('fill', (d: GraphNode) => d.color)
      .attr('opacity', (d: GraphNode) => (d.status === 'completed' ? 0.8 : 0.5))
      .attr('rx', 4)
      .on('click', (event: any, d: GraphNode) => this.onNodeClick(event, d))
      .on('mouseenter', (event: any, d: GraphNode) => this.onNodeHover(event, d))
      .on('mousemove', (event: any, d: GraphNode) => this.onNodeMove(event, d))
      .on('mouseleave', () => this.onNodeLeave())
      .style('cursor', 'pointer');

    // Status indicator circles
    nodeGroups
      .append('circle')
      .attr('class', 'status-indicator')
      .attr('cx', (d: GraphNode) =>
        d.endTime ? this.xScale(d.endTime) : this.xScale(d.startTime) + 10
      )
      .attr('cy', this.yScale.bandwidth() / 2)
      .attr('r', (d: GraphNode) => d.type === 'tool' ? 8 : 5)
      .attr('fill', (d: GraphNode) => this.getStatusColor(d.status))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('click', (event: any, d: GraphNode) => this.onNodeClick(event, d))
      .on('mouseenter', (event: any, d: GraphNode) => this.onNodeHover(event, d))
      .on('mousemove', (event: any, d: GraphNode) => this.onNodeMove(event, d))
      .on('mouseleave', () => this.onNodeLeave())
      .style('cursor', 'pointer');
  }

  private renderLabels(): void {
    // Node labels inside bars if there's enough space
    const nodeGroups = this.g.selectAll('.node-bar-group');

    nodeGroups
      .append('text')
      .attr('class', 'node-label')
      .attr('x', (d: GraphNode) => this.xScale(d.startTime) + 8)
      .attr('y', this.yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .text((d: GraphNode) => {
        const width = d.endTime
          ? this.xScale(d.endTime) - this.xScale(d.startTime)
          : 20;
        return width > 100 ? d.name : '';
      })
      .attr('fill', 'white')
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .style('pointer-events', 'none');
  }

  private renderEdges(): void {
    const edges = this.graphData.edges;

    this.g
      .selectAll('.edge-line')
      .data(edges)
      .enter()
      .append('line')
      .attr('class', 'edge-line')
      .attr('x1', (d: GraphEdge) => {
        const sourceNode = this.getNodeById(typeof d.source === 'string' ? d.source : d.source.id);
        return sourceNode && sourceNode.endTime
          ? this.xScale(sourceNode.endTime)
          : 0;
      })
      .attr('y1', (d: GraphEdge) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        return (this.yScale(sourceId) || 0) + this.yScale.bandwidth() / 2;
      })
      .attr('x2', (d: GraphEdge) => {
        const targetNode = this.getNodeById(typeof d.target === 'string' ? d.target : d.target.id);
        return targetNode ? this.xScale(targetNode.startTime) : 0;
      })
      .attr('y2', (d: GraphEdge) => {
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        return (this.yScale(targetId) || 0) + this.yScale.bandwidth() / 2;
      })
      .attr('stroke', '#999')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d: GraphEdge) => (d.type === 'dependency' ? '4,2' : 'none'))
      .attr('marker-end', 'url(#arrowhead)')
      .attr('opacity', 0.6);
  }

  private renderTimelineView(): void {
    // Simplified timeline view - similar to gantt but with events as circles
    this.renderGanttView(); // Reuse gantt for now
  }

  private renderDependenciesView(): void {
    // Focus on showing dependencies with a clearer layout
    this.renderGanttView(); // Reuse gantt for now, can be enhanced later
  }

  private getNodeById(id: string): GraphNode | undefined {
    return this.graphData.nodes.find((n) => n.id === id);
  }

  private getStatusColor(status: string): string {
    const statusMap: Record<string, string> = {
      pending: '#9ca3af',
      running: '#3b82f6',
      completed: '#10b981',
      error: '#ef4444',
      retrying: '#f59e0b',
    };
    return statusMap[status] || '#6b7280';
  }

  onNodeClick(event: MouseEvent, node: GraphNode): void {
    event.stopPropagation();
    // Toggle pinned state - if clicking same node, unpin it
    if (this.pinnedNode?.id === node.id) {
      this.pinnedNode = null;
    } else {
      this.pinnedNode = node;
      this.updateTooltipPosition(event);
    }
    // Keep selected node for side panel
    this.selectedNode = this.selectedNode?.id === node.id ? null : node;
    this.cdr.detectChanges();
  }

  onNodeHover(event: MouseEvent, node: GraphNode): void {
    // Only set hover if nothing is pinned
    if (!this.pinnedNode) {
      this.hoveredNode = node;
      this.updateTooltipPosition(event);
      this.cdr.detectChanges();
    }
  }

  onNodeMove(event: MouseEvent, node: GraphNode): void {
    // Only update position if this node is hovered (not pinned)
    if (!this.pinnedNode && this.hoveredNode?.id === node.id) {
      this.updateTooltipPosition(event);
      this.cdr.detectChanges();
    }
  }

  onNodeLeave(): void {
    // Only clear hover if nothing is pinned
    if (!this.pinnedNode) {
      this.hoveredNode = null;
      this.cdr.detectChanges();
    }
  }

  unpinTooltip(): void {
    this.pinnedNode = null;
    this.hoveredNode = null;
    this.cdr.detectChanges();
  }

  get activeTooltipNode(): GraphNode | null {
    return this.pinnedNode || this.hoveredNode;
  }

  get isTooltipPinned(): boolean {
    return this.pinnedNode !== null;
  }

  private updateTooltipPosition(event: MouseEvent): void {
    // Position tooltip near mouse cursor with offset
    this.tooltipX = event.pageX + 15;
    this.tooltipY = event.pageY + 15;
  }

  formatTooltipData(data: any): string {
    if (!data) return '';

    // For web_fetch output, show title and truncated content
    if (data.title && data.content) {
      const content = data.content.substring(0, 300);
      return `Title: ${data.title}\nURL: ${data.url || 'N/A'}\n\nContent: ${content}${data.content.length > 300 ? '...' : ''}`;
    }

    // For web_fetch input, show URL
    if (data.url && !data.content) {
      return `URL: ${data.url}`;
    }

    // For other data, show as JSON (truncated)
    const jsonStr = JSON.stringify(data, null, 2);
    if (jsonStr.length > 500) {
      return jsonStr.substring(0, 500) + '\n...\n(truncated)';
    }
    return jsonStr;
  }

  zoomIn(): void {
    this.svg.transition().call(this.zoom.scaleBy, 1.3);
  }

  zoomOut(): void {
    this.svg.transition().call(this.zoom.scaleBy, 0.7);
  }

  resetZoom(): void {
    this.svg.transition().call(this.zoom.transform, d3.zoomIdentity);
  }

  onViewModeChange(): void {
    this.renderVisualization();
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getScreenshotUrl(screenshotPath: string): string {
    // Convert file path to API endpoint URL
    // Path format: data/fetched-content/logId/hash.png
    // API URL format: /api/logs/screenshot/data/fetched-content/logId/hash.png
    return `/api/logs/screenshot/${screenshotPath}`;
  }

  onScreenshotError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error('Failed to load screenshot:', img.src);
    img.style.display = 'none';
  }
}
