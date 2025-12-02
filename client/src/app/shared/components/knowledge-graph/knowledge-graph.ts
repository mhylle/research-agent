import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ElementRef,
  ViewChild,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { GraphNode, GraphEdge, GraphData, NodeStatus, NodeType } from '../../../models';

interface SimulationNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
}

interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  id: string;
  source: SimulationNode | string;
  target: SimulationNode | string;
  type: 'parent-child' | 'dependency' | 'data-flow' | 'retry';
  label?: string;
  animated?: boolean;
}

interface Particle {
  edge: SimulationLink;
  progress: number;
  speed: number;
  size: number;
  color: string;
}

@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="knowledge-graph-container" #container>
      <svg #graphSvg>
        <defs>
          <!-- Glow filters for different states -->
          <filter id="glow-running" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="glow-completed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="glow-error" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <!-- Gradient for edges -->
          <linearGradient id="edge-gradient" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#a8a29e" stop-opacity="0.3"/>
            <stop offset="50%" stop-color="#78716c" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#a8a29e" stop-opacity="0.3"/>
          </linearGradient>

          <!-- Arrow marker -->
          <marker id="arrow" viewBox="0 -5 10 10" refX="20" refY="0"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#a8a29e"/>
          </marker>
          <marker id="arrow-active" viewBox="0 -5 10 10" refX="20" refY="0"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#4d7c0f"/>
          </marker>
        </defs>
        <g class="zoom-container">
          <g class="edges-layer"></g>
          <g class="particles-layer"></g>
          <g class="nodes-layer"></g>
          <g class="labels-layer"></g>
        </g>
      </svg>

      <!-- Tooltip -->
      <div class="graph-tooltip" #tooltip>
        <div class="tooltip-header">
          <span class="tooltip-icon">{{ tooltipData()?.icon }}</span>
          <span class="tooltip-title">{{ tooltipData()?.name }}</span>
        </div>
        <div class="tooltip-status" [class]="'status-' + tooltipData()?.status">
          {{ tooltipData()?.status | titlecase }}
        </div>
        @if (tooltipData()?.duration) {
          <div class="tooltip-metric">
            <span class="metric-label">Duration:</span>
            <span class="metric-value">{{ formatDuration(tooltipData()?.duration) }}</span>
          </div>
        }
        @if (tooltipData()?.metrics?.tokensUsed) {
          <div class="tooltip-metric">
            <span class="metric-label">Tokens:</span>
            <span class="metric-value">{{ tooltipData()?.metrics?.tokensUsed | number }}</span>
          </div>
        }
      </div>

      <!-- Controls -->
      <div class="graph-controls">
        <button class="control-btn" (click)="zoomIn()" title="Zoom In">
          <span>+</span>
        </button>
        <button class="control-btn" (click)="zoomOut()" title="Zoom Out">
          <span>−</span>
        </button>
        <button class="control-btn" (click)="resetView()" title="Reset View">
          <span>⟲</span>
        </button>
        <button class="control-btn" [class.active]="isAnimating()"
                (click)="toggleAnimation()" title="Toggle Animation">
          <span>{{ isAnimating() ? '⏸' : '▶' }}</span>
        </button>
      </div>

      <!-- Legend -->
      <div class="graph-legend">
        <div class="legend-title">Node Types</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-dot stage"></span>
            <span>Stage</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot tool"></span>
            <span>Tool</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot llm"></span>
            <span>LLM</span>
          </div>
        </div>
        <div class="legend-title">Status</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-dot running"></span>
            <span>Running</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot completed"></span>
            <span>Completed</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot error"></span>
            <span>Error</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .knowledge-graph-container {
      width: 100%;
      height: 100%;
      min-height: 500px;
      position: relative;
      background: linear-gradient(135deg, #e7e5e4 0%, #d6d3d1 50%, #e7e5e4 100%);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: inset 0 2px 8px rgba(41, 37, 36, 0.06);
    }

    svg {
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    svg:active {
      cursor: grabbing;
    }

    /* Tooltip Styles */
    .graph-tooltip {
      position: absolute;
      background: #f5f5f4;
      backdrop-filter: blur(8px);
      border: 1px solid #d6d3d1;
      border-radius: 12px;
      padding: 16px;
      min-width: 180px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      z-index: 100;
      box-shadow: 0 20px 40px rgba(41, 37, 36, 0.15);
    }

    .graph-tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .tooltip-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .tooltip-icon {
      font-size: 1.5rem;
    }

    .tooltip-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      font-weight: 600;
      color: #292524;
    }

    .tooltip-status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .tooltip-status.status-running {
      background: #ecfccb;
      color: #4d7c0f;
    }

    .tooltip-status.status-completed {
      background: #d1fae5;
      color: #059669;
    }

    .tooltip-status.status-error {
      background: #fef2f2;
      color: #dc2626;
    }

    .tooltip-status.status-pending {
      background: #e7e5e4;
      color: #64748b;
    }

    .tooltip-metric {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-top: 1px solid #d6d3d1;
    }

    .metric-label {
      color: #64748b;
      font-size: 0.75rem;
    }

    .metric-value {
      color: #292524;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }

    /* Controls */
    .graph-controls {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .control-btn {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #f5f5f4;
      backdrop-filter: blur(8px);
      border: 1px solid #d6d3d1;
      color: #292524;
      font-size: 1.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px -2px rgba(41, 37, 36, 0.06);
    }

    .control-btn:hover {
      background: #ecfccb;
      border-color: #4d7c0f;
      transform: scale(1.05);
    }

    .control-btn.active {
      background: #4d7c0f;
      border-color: #4d7c0f;
      color: #fff;
    }

    /* Legend */
    .graph-legend {
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: #f5f5f4;
      backdrop-filter: blur(8px);
      border: 1px solid #d6d3d1;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.75rem;
      box-shadow: 0 8px 24px -4px rgba(41, 37, 36, 0.08);
    }

    .legend-title {
      color: #64748b;
      font-weight: 600;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .legend-title:not(:first-child) {
      margin-top: 12px;
    }

    .legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #44403c;
    }

    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .legend-dot.stage { background: #4d7c0f; }
    .legend-dot.tool { background: #64748b; }
    .legend-dot.llm { background: #7c3aed; }
    .legend-dot.running {
      background: #65a30d;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .legend-dot.completed { background: #4d7c0f; }
    .legend-dot.error { background: #dc2626; }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.2); }
    }

    /* Node animations via CSS */
    :host ::ng-deep .node-running {
      animation: node-pulse 1.5s ease-in-out infinite;
    }

    @keyframes node-pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }
  `]
})
export class KnowledgeGraphComponent implements OnInit, OnChanges, OnDestroy {
  @Input() data: GraphData | null = null;
  @Input() width: number = 800;
  @Input() height: number = 600;
  @Input() autoAnimate: boolean = true;

  @ViewChild('graphSvg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip', { static: true }) tooltipRef!: ElementRef<HTMLDivElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  // Signals
  tooltipData = signal<GraphNode | null>(null);
  isAnimating = signal<boolean>(true);

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private zoomContainer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private simulation!: d3.Simulation<SimulationNode, SimulationLink>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private tooltip!: d3.Selection<HTMLDivElement, unknown, null, undefined>;

  private nodes: SimulationNode[] = [];
  private links: SimulationLink[] = [];
  private particles: Particle[] = [];
  private animationFrameId: number | null = null;

  // Color schemes - Digital Hygge palette
  private readonly nodeColors: Record<NodeType, string> = {
    stage: '#4d7c0f',    // moss - primary action
    tool: '#64748b',     // slate - tools
    llm: '#7c3aed',      // violet - LLM (timeline color)
    retry: '#ea580c'     // clay - warnings
  };

  private readonly statusColors: Record<NodeStatus, string> = {
    pending: '#a8a29e',  // stone-400
    running: '#65a30d',  // moss-light
    completed: '#4d7c0f', // moss
    error: '#dc2626',    // red-600
    retrying: '#ea580c'  // clay
  };

  private readonly nodeSizes: Record<string, number> = {
    small: 20,
    medium: 30,
    large: 40
  };

  ngOnInit(): void {
    this.initializeGraph();
    if (this.data) {
      this.updateGraph();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateGraph();
    }
  }

  ngOnDestroy(): void {
    this.stopAnimation();
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  private initializeGraph(): void {
    this.svg = d3.select(this.svgRef.nativeElement);
    this.tooltip = d3.select(this.tooltipRef.nativeElement);
    this.zoomContainer = this.svg.select('.zoom-container') as d3.Selection<SVGGElement, unknown, null, undefined>;

    // Setup zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        this.zoomContainer.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Initialize force simulation
    this.simulation = d3.forceSimulation<SimulationNode, SimulationLink>()
      .force('link', d3.forceLink<SimulationNode, SimulationLink>()
        .id(d => d.id)
        .distance(120)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .on('tick', () => this.ticked());

    // Start particle animation
    if (this.autoAnimate) {
      this.startAnimation();
    }
  }

  private updateGraph(): void {
    if (!this.data) return;

    // Convert data to simulation format
    this.nodes = this.data.nodes.map(node => ({
      ...node,
      x: node.x ?? this.width / 2 + (Math.random() - 0.5) * 200,
      y: node.y ?? this.height / 2 + (Math.random() - 0.5) * 200,
      vx: node.vx ?? 0,
      vy: node.vy ?? 0,
      fx: node.fx ?? null,
      fy: node.fy ?? null
    }));

    this.links = this.data.edges.map(edge => ({
      id: edge.id,
      source: edge.source as string,
      target: edge.target as string,
      type: edge.type,
      label: edge.label,
      animated: edge.animated
    }));

    // Update simulation
    this.simulation.nodes(this.nodes);
    (this.simulation.force('link') as d3.ForceLink<SimulationNode, SimulationLink>)
      .links(this.links);

    // Render elements
    this.renderEdges();
    this.renderNodes();
    this.renderLabels();

    // Restart simulation
    this.simulation.alpha(0.8).restart();

    // Initialize particles for animated edges
    this.initializeParticles();
  }

  private renderEdges(): void {
    const edgeLayer = this.zoomContainer.select('.edges-layer');

    const edges = edgeLayer
      .selectAll<SVGPathElement, SimulationLink>('.edge')
      .data(this.links, d => d.id);

    edges.exit()
      .transition()
      .duration(300)
      .style('opacity', 0)
      .remove();

    const enterEdges = edges.enter()
      .append('path')
      .attr('class', 'edge')
      .style('fill', 'none')
      .style('stroke', '#a8a29e')
      .style('stroke-width', 2)
      .style('opacity', 0)
      .attr('marker-end', 'url(#arrow)');

    enterEdges.transition()
      .duration(500)
      .style('opacity', 0.6);

    edges.merge(enterEdges)
      .classed('animated', d => d.animated ?? false)
      .style('stroke-dasharray', d => d.animated ? '8,4' : 'none');
  }

  private renderNodes(): void {
    const nodeLayer = this.zoomContainer.select('.nodes-layer');

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, SimulationNode>('.node-group')
      .data(this.nodes, d => d.id);

    nodeGroups.exit()
      .transition()
      .duration(300)
      .style('opacity', 0)
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y}) scale(0)`)
      .remove();

    const enterGroups = nodeGroups.enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .call(this.drag());

    // Outer glow ring (for running nodes)
    enterGroups.append('circle')
      .attr('class', 'glow-ring')
      .attr('r', d => this.nodeSizes[d.size] + 8)
      .style('fill', 'none')
      .style('stroke', d => this.statusColors[d.status])
      .style('stroke-width', 3)
      .style('opacity', 0);

    // Main node circle
    enterGroups.append('circle')
      .attr('class', 'node-circle')
      .attr('r', 0)
      .style('fill', d => this.nodeColors[d.type])
      .style('stroke', '#f5f5f4')
      .style('stroke-width', 3);

    // Inner highlight
    enterGroups.append('circle')
      .attr('class', 'node-highlight')
      .attr('r', 0)
      .style('fill', 'rgba(255,255,255,0.2)')
      .attr('cy', d => -this.nodeSizes[d.size] * 0.15);

    // Icon text
    enterGroups.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', d => `${this.nodeSizes[d.size] * 0.6}px`)
      .style('opacity', 0)
      .text(d => d.icon);

    // Animate entrance
    enterGroups.select('.node-circle')
      .transition()
      .duration(500)
      .ease(d3.easeElasticOut)
      .attr('r', d => this.nodeSizes[d.size]);

    enterGroups.select('.node-highlight')
      .transition()
      .duration(500)
      .delay(200)
      .attr('r', d => this.nodeSizes[d.size] * 0.6);

    enterGroups.select('.node-icon')
      .transition()
      .duration(300)
      .delay(300)
      .style('opacity', 1);

    // Merge and update all nodes
    const allGroups = nodeGroups.merge(enterGroups);

    // Update styles based on status
    allGroups.select('.node-circle')
      .style('fill', d => this.nodeColors[d.type])
      .attr('filter', d => {
        if (d.status === 'running') return 'url(#glow-running)';
        if (d.status === 'completed') return 'url(#glow-completed)';
        if (d.status === 'error') return 'url(#glow-error)';
        return null;
      });

    // Show glow ring for running nodes
    allGroups.select('.glow-ring')
      .style('opacity', d => d.status === 'running' ? 0.5 : 0)
      .style('stroke', d => this.statusColors[d.status]);

    // Add running animation class
    allGroups.classed('node-running', d => d.status === 'running');

    // Setup interactions
    allGroups
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mousemove', (event) => this.updateTooltipPosition(event))
      .on('mouseleave', () => this.hideTooltip());
  }

  private renderLabels(): void {
    const labelLayer = this.zoomContainer.select('.labels-layer');

    const labels = labelLayer
      .selectAll<SVGTextElement, SimulationNode>('.node-label')
      .data(this.nodes, d => d.id);

    labels.exit().remove();

    const enterLabels = labels.enter()
      .append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', d => this.nodeSizes[d.size] + 16)
      .style('font-family', "'JetBrains Mono', monospace")
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#44403c')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .text(d => this.truncateLabel(d.name));

    enterLabels.transition()
      .duration(500)
      .delay(400)
      .style('opacity', 1);

    labels.merge(enterLabels)
      .text(d => this.truncateLabel(d.name));
  }

  private initializeParticles(): void {
    this.particles = [];

    // Create particles for animated edges
    this.links.forEach(link => {
      if (link.animated) {
        // Add multiple particles per edge
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            edge: link,
            progress: Math.random(),
            speed: 0.005 + Math.random() * 0.005,
            size: 3 + Math.random() * 2,
            color: '#4d7c0f'
          });
        }
      }
    });
  }

  private ticked(): void {
    // Update edge paths
    this.zoomContainer.selectAll<SVGPathElement, SimulationLink>('.edge')
      .attr('d', d => this.linkArc(d));

    // Update node positions
    this.zoomContainer.selectAll<SVGGElement, SimulationNode>('.node-group')
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // Update label positions
    this.zoomContainer.selectAll<SVGTextElement, SimulationNode>('.node-label')
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  }

  private linkArc(d: SimulationLink): string {
    const source = d.source as SimulationNode;
    const target = d.target as SimulationNode;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // Curve factor

    return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
  }

  private startAnimation(): void {
    this.isAnimating.set(true);
    const animate = () => {
      if (!this.isAnimating()) return;

      this.updateParticles();
      this.renderParticles();
      this.animateGlowRings();

      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  private stopAnimation(): void {
    this.isAnimating.set(false);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private updateParticles(): void {
    this.particles.forEach(particle => {
      particle.progress += particle.speed;
      if (particle.progress > 1) {
        particle.progress = 0;
      }
    });
  }

  private renderParticles(): void {
    const particleLayer = this.zoomContainer.select('.particles-layer');

    const particleCircles = particleLayer
      .selectAll<SVGCircleElement, Particle>('.particle')
      .data(this.particles);

    particleCircles.enter()
      .append('circle')
      .attr('class', 'particle')
      .attr('r', d => d.size)
      .style('fill', d => d.color)
      .style('filter', 'url(#glow-running)')
      .merge(particleCircles)
      .attr('cx', d => this.getParticlePosition(d).x)
      .attr('cy', d => this.getParticlePosition(d).y)
      .style('opacity', d => {
        // Fade in/out at edges
        const fadeZone = 0.1;
        if (d.progress < fadeZone) return d.progress / fadeZone;
        if (d.progress > 1 - fadeZone) return (1 - d.progress) / fadeZone;
        return 1;
      });

    particleCircles.exit().remove();
  }

  private getParticlePosition(particle: Particle): { x: number; y: number } {
    const source = particle.edge.source as SimulationNode;
    const target = particle.edge.target as SimulationNode;

    // Interpolate along the curved path
    const t = particle.progress;
    const dx = target.x - source.x;
    const dy = target.y - source.y;

    // Add curve offset
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const offset = Math.sin(t * Math.PI) * Math.sqrt(dx * dx + dy * dy) * 0.2;

    // Perpendicular offset direction
    const length = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / length * offset;
    const perpY = dx / length * offset;

    return {
      x: source.x + dx * t + perpX,
      y: source.y + dy * t + perpY
    };
  }

  private animateGlowRings(): void {
    const time = Date.now() / 1000;

    this.zoomContainer.selectAll<SVGCircleElement, SimulationNode>('.glow-ring')
      .filter(d => d.status === 'running')
      .attr('r', d => this.nodeSizes[d.size] + 8 + Math.sin(time * 3) * 4)
      .style('opacity', 0.3 + Math.sin(time * 3) * 0.2);
  }

  private drag(): any {
    return d3.drag<SVGGElement, SimulationNode>()
      .on('start', (event: any, d: SimulationNode) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: SimulationNode) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: SimulationNode) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  private showTooltip(event: MouseEvent, node: SimulationNode): void {
    this.tooltipData.set(node);
    this.tooltip.classed('visible', true);
    this.updateTooltipPosition(event);
  }

  private updateTooltipPosition(event: MouseEvent): void {
    const container = this.containerRef.nativeElement.getBoundingClientRect();
    const tooltipNode = this.tooltipRef.nativeElement;

    let left = event.clientX - container.left + 15;
    let top = event.clientY - container.top - 10;

    // Keep within bounds
    if (left + tooltipNode.offsetWidth > container.width - 20) {
      left = event.clientX - container.left - tooltipNode.offsetWidth - 15;
    }
    if (top + tooltipNode.offsetHeight > container.height - 20) {
      top = container.height - tooltipNode.offsetHeight - 20;
    }

    this.tooltip
      .style('left', `${left}px`)
      .style('top', `${top}px`);
  }

  private hideTooltip(): void {
    this.tooltipData.set(null);
    this.tooltip.classed('visible', false);
  }

  private truncateLabel(label: string): string {
    return label.length > 15 ? label.substring(0, 12) + '...' : label;
  }

  // Public control methods
  zoomIn(): void {
    this.svg.transition()
      .duration(300)
      .call(this.zoom.scaleBy, 1.3);
  }

  zoomOut(): void {
    this.svg.transition()
      .duration(300)
      .call(this.zoom.scaleBy, 0.7);
  }

  resetView(): void {
    this.svg.transition()
      .duration(500)
      .call(this.zoom.transform, d3.zoomIdentity
        .translate(this.width / 2, this.height / 2)
        .scale(0.8)
        .translate(-this.width / 2, -this.height / 2));
  }

  toggleAnimation(): void {
    if (this.isAnimating()) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  formatDuration(ms?: number): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}
