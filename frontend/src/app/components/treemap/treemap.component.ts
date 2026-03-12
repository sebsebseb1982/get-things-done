import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ElementRef,
  AfterViewInit,
  NgZone,
  OnDestroy,
  inject,
} from '@angular/core';
import * as d3 from 'd3';
import { Todo } from '../../models/todo.model';

interface BubbleDatum {
  todo: Todo;
  r: number;      // radius derived from effort
  score: number;  // priority × (6 - effort) → higher = more urgent / quick-win
  x?: number;
  y?: number;
}

@Component({
  selector: 'app-treemap',
  standalone: true,
  template: `
    <div class="relative w-full h-full">
      <svg #svg class="w-full h-full" style="display:block"></svg>
      @if (todos.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center text-gray-500 text-xl">
          No todos yet — add your first task!
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    :host ::ng-deep .bubble { cursor: pointer; }
  `],
  imports: [],
})
export class TreemapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() todos: Todo[] = [];
  @Output() editTodo = new EventEmitter<Todo>();
  @Output() toggleDone = new EventEmitter<Todo>();

  private el = inject(ElementRef);
  private zone = inject(NgZone);
  private resizeObserver!: ResizeObserver;
  private simulation?: d3.Simulation<BubbleDatum, undefined>;
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private hoveredNodes = new Set<BubbleDatum>();

  ngAfterViewInit(): void {
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => this.render());
    });
    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['todos']) {
      const prev = changes['todos'].previousValue as Todo[] | undefined;
      const curr = changes['todos'].currentValue as Todo[];
      // Skip re-render when the data hasn't actually changed
      // (prevents re-rendering on every keystroke when the form is open)
      if (prev && JSON.stringify(prev) === JSON.stringify(curr)) return;
    }
    this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.simulation?.stop();
  }

  private deadlineBonus(deadline: string | null, effort: number): number {
    if (!deadline) return 0;
    const msRemaining = new Date(deadline).getTime() - Date.now();
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

    if (daysRemaining <= 0) return 50; // overdue → absolute maximum

    // Urgency window scales with effort: effort 1 → 3 days, effort 5 → 15 days
    const urgencyWindowDays = effort * 3;

    if (daysRemaining >= urgencyWindowDays) return 0;

    // Exponential ramp: approaches 50 as deadline nears
    const progress = 1 - (daysRemaining / urgencyWindowDays); // 0 → 1
    return Math.round(50 * Math.pow(progress, 1.5));
  }

  private priorityColor(priority: number, done: boolean): string {
    if (done) return '#374151';
    const colors: Record<number, string> = {
      5: '#ef4444',
      4: '#f97316',
      3: '#eab308',
      2: '#84cc16',
      1: '#22c55e',
    };
    return colors[priority] ?? '#6b7280';
  }

  private render(): void {
    const container = this.el.nativeElement as HTMLElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    this.simulation?.stop();

    const svg = d3.select<SVGSVGElement, unknown>(svgEl as SVGSVGElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    if (this.todos.length === 0) return;

    // Radius scale: effort 1 → small, effort 5 → large
    const dim = Math.min(width, height);
    const nominalRScale = d3.scaleSqrt().domain([1, 5]).range([
      dim * 0.0675,
      dim * 0.143,
    ]);

    const cx = width / 2;
    const cy = height / 2;

    // ── Build data with scores ─────────────────────────────────────────
    const data: BubbleDatum[] = this.todos.map((t) => ({
      todo: t,
      r: nominalRScale(t.effort),
      score: t.done
        ? -1
        : t.priority * (6 - t.effort) + this.deadlineBonus(t.deadline, t.effort),
    }));

    // Sort by score descending: highest-score items are packed first (center)
    data.sort((a, b) => b.score - a.score);

    // ── Use d3.packSiblings for guaranteed non-overlapping packing ──────
    // packSiblings uses the .r property and adds x, y coordinates.
    // Items packed first (highest score) end up near center.
    // Inflate radii by a margin so bubbles don't touch each other.
    const BUBBLE_MARGIN = 4; // gap half-width in pre-scale px
    for (const d of data) d.r += BUBBLE_MARGIN;
    d3.packSiblings(data);

    // ── Scale & translate to fit viewport ──────────────────────────────
    // Find bounding box of packed circles (including inflated radii)
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const d of data) {
      bx0 = Math.min(bx0, (d.x ?? 0) - d.r);
      by0 = Math.min(by0, (d.y ?? 0) - d.r);
      bx1 = Math.max(bx1, (d.x ?? 0) + d.r);
      by1 = Math.max(by1, (d.y ?? 0) + d.r);
    }
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    const padding = 8;
    const scale = Math.min(
      (width - padding * 2) / bw,
      (height - padding * 2) / bh,
    );
    const bcx = (bx0 + bx1) / 2;
    const bcy = (by0 + by1) / 2;
    for (const d of data) {
      d.x = cx + ((d.x ?? 0) - bcx) * scale;
      d.y = cy + ((d.y ?? 0) - bcy) * scale;
      // Deflate the margin before scaling so the display radius is the original
      d.r = (d.r - BUBBLE_MARGIN) * scale;
    }

    // ── Top-3 priority ranking (non-done, highest score first) ──────────
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze
    const top3 = new Map<BubbleDatum, number>();
    [...data]
      .filter(d => !d.todo.done)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .forEach((d, i) => top3.set(d, i + 1));

    // ── Radial gradient background (center brighter → edge darker) ────
    const defs = svg.append('defs');
    const grad = defs.append('radialGradient')
      .attr('id', 'bg-grad')
      .attr('cx', '50%').attr('cy', '50%')
      .attr('r', '50%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#1f2937').attr('stop-opacity', 0.6);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#111827').attr('stop-opacity', 0.9);

    // Glow filter for medal halos
    const glowFilter = defs.append('filter')
      .attr('id', 'medal-glow')
      .attr('x', '-40%').attr('y', '-40%')
      .attr('width', '180%').attr('height', '180%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.insert('rect', ':first-child')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#bg-grad)');

    // ── Concentric guide rings + radial labels ─────────────────────────
    // Compute the max distance from center to any bubble edge for guide sizing
    const guideRadius = Math.max(...data.map(d =>
      Math.sqrt((d.x! - cx) ** 2 + (d.y! - cy) ** 2) + d.r
    ));
    const guideG = svg.append('g').attr('pointer-events', 'none');

    [0.33, 0.66, 1.0].forEach((factor) => {
      guideG.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', guideRadius * factor)
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '4 6')
        .attr('opacity', 0.12);
    });

    guideG.append('text')
      .attr('x', cx)
      .attr('y', cy - guideRadius * 0.04)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#9ca3af')
      .attr('opacity', 0.3)
      .attr('pointer-events', 'none')
      .text('● Urgent');

    guideG.append('text')
      .attr('x', cx)
      .attr('y', cy - guideRadius - 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#9ca3af')
      .attr('opacity', 0.3)
      .attr('pointer-events', 'none')
      .text('Low priority');

    // ── Bubble groups ──────────────────────────────────────────────────
    const bubbleG = svg.append('g');

    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    const node = bubbleG
      .selectAll<SVGGElement, BubbleDatum>('g.bubble')
      .data(data)
      .join('g')
      .attr('class', 'bubble')
      .on('click', (_evt, d) => {
        if (this.clickTimer !== null) {
          // Second click within 250ms → double-click: toggle done
          clearTimeout(this.clickTimer);
          this.clickTimer = null;
          this.zone.run(() => this.toggleDone.emit(d.todo));
        } else {
          // First click: wait to see if a second follows
          this.clickTimer = setTimeout(() => {
            this.clickTimer = null;
            this.zone.run(() => this.editTodo.emit(d.todo));
          }, 250);
        }
      });

    // Native SVG tooltip — shows full title on hover
    node.append('title').text((d) => d.todo.title);

    // ── Pulsing medal halo ring (rendered behind the main circle) ────────
    const medalRings = node.filter(d => top3.has(d))
      .append('circle')
      .attr('r', (d) => d.r + 6)
      .attr('fill', 'none')
      .attr('stroke', (d) => medalColors[(top3.get(d) ?? 1) - 1])
      .attr('stroke-width', 2.5)
      .attr('filter', 'url(#medal-glow)')
      .attr('pointer-events', 'none');
    medalRings.append('animate')
      .attr('attributeName', 'stroke-opacity')
      .attr('values', '0.95;0.25;0.95')
      .attr('dur', '2.4s')
      .attr('repeatCount', 'indefinite');

    // Circle
    node.append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => this.priorityColor(d.todo.priority, d.todo.done))
      .attr('stroke', (d) => d.todo.done ? '#4b5563' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', 1.5);

    // Done dimming overlay
    node.filter((d) => d.todo.done)
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', 'rgba(0,0,0,0.5)');

    // ── Top icon zone: ✓ when done, ⚠ when deadline is close ─────────
    // Done checkmark (top-center)
    node.filter((d) => d.todo.done)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('y', (d) => -d.r * 0.52)
      .attr('font-size', (d) => Math.min(18, Math.max(10, d.r * 0.36)))
      .attr('fill', 'rgba(255,255,255,0.85)')
      .attr('pointer-events', 'none')
      .text('✓');

    // Deadline warning badge (top-center, only when not done and deadline < 3 days)
    node.filter((d) => {
        const dl = d.todo.deadline;
        return !!dl && !d.todo.done && new Date(dl).getTime() - now < threeDays;
      })
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('y', (d) => -d.r * 0.52)
      .attr('font-size', (d) => Math.min(16, Math.max(10, d.r * 0.32)))
      .attr('fill', '#fbbf24')
      .attr('pointer-events', 'none')
      .text('⚠');

    // Deadline calendar icon (top-center, only when not done and deadline >= 3 days away)
    node.filter((d) => {
        const dl = d.todo.deadline;
        return !!dl && !d.todo.done && new Date(dl).getTime() - now >= threeDays;
      })
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('y', (d) => -d.r * 0.52)
      .attr('font-size', (d) => Math.min(16, Math.max(10, d.r * 0.32)))
      .attr('fill', 'rgba(255,255,255,0.75)')
      .attr('pointer-events', 'none')
      .text('🗓');

    // ── Medal rank badge for top-3 (top-right corner) ────────────────
    const topRankNodes = node.filter(d => top3.has(d));
    topRankNodes.append('circle')
      .attr('cx', (d) => d.r * 0.62)
      .attr('cy', (d) => -d.r * 0.62)
      .attr('r', (d) => Math.max(9, d.r * 0.26))
      .attr('fill', (d) => medalColors[(top3.get(d) ?? 1) - 1])
      .attr('stroke', 'rgba(0,0,0,0.55)')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');
    topRankNodes.append('text')
      .attr('x', (d) => d.r * 0.62)
      .attr('y', (d) => -d.r * 0.62)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', (d) => Math.max(8, d.r * 0.23))
      .attr('font-weight', '800')
      .attr('fill', '#1a1a1a')
      .attr('pointer-events', 'none')
      .text((d) => String(top3.get(d) ?? ''));

    // ── Helper: render title label (normal or hover state) ───────────
    // Hover scale is inversely proportional to radius:
    // small bubbles zoom a lot (to reach MIN_HOVER_R), large bubbles barely move.
    const MIN_HOVER_R = 60;  // target effective radius (px) for the smallest bubbles
    const MIN_SCALE   = 1.04; // floor: even huge bubbles get a tiny nudge for feedback
    const MAX_SCALE   = 2.4;  // ceiling
    const hoverScaleFor = (r: number) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, MIN_HOVER_R / r));

    const clampPos = (d: BubbleDatum) => ({
      x: Math.max(d.r + 2, Math.min(width - d.r - 2, d.x ?? width / 2)),
      y: Math.max(d.r + 2, Math.min(height - d.r - 2, d.y ?? height / 2)),
    });

    const renderLabel = (g: d3.Selection<SVGGElement, BubbleDatum, any, any>, d: BubbleDatum, hover: boolean) => {
      g.selectAll('.bubble-label').remove();

      if (hover) {
        // Hover state: smaller local font (visual font ≈ normal due to scale), no truncation, up to 4 lines
        const fontSize = Math.min(10, Math.max(6.5, d.r / 4.8));
        const maxW = d.r * 1.7;
        const charsPerLine = Math.max(6, Math.floor(maxW / (fontSize * 0.58)));
        const words = d.todo.title.split(' ');
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (test.length <= charsPerLine) { cur = test; }
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        const displayLines = lines.slice(0, 4);
        const lineH = fontSize * 1.35;
        const totalH = displayLines.length * lineH;
        const startY = -(totalH / 2) + lineH * 0.5;

        const textEl = g.append('text')
          .attr('class', 'bubble-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', fontSize)
          .attr('font-weight', '600')
          .attr('fill', 'white')
          .attr('pointer-events', 'none');

        displayLines.forEach((line, i) => {
          textEl.append('tspan')
            .attr('x', 0)
            .attr('y', startY + i * lineH)
            .text(line);
        });

        // Always show E·P in hover state
        g.append('text')
          .attr('class', 'bubble-label')
          .attr('text-anchor', 'middle')
          .attr('y', d.r * 0.7)
          .attr('font-size', 7.5)
          .attr('fill', 'rgba(255,255,255,0.65)')
          .attr('pointer-events', 'none')
          .text(`E${d.todo.effort} · P${d.todo.priority}`);

      } else {
        // Normal state: truncated, original logic
        const fontSize = Math.min(13, Math.max(7, d.r / 5.5));
        const words = d.todo.title.split(' ');
        const maxW = d.r * 1.6;
        const hasEP = d.r > 50;
        const effortCap: Record<number, number> = { 1: 16, 2: 16, 3: 18, 4: 22, 5: 24 };
        const charsPerLine = Math.min(
          effortCap[d.todo.effort] ?? 20,
          Math.max(3, Math.floor(maxW / (fontSize * 0.6)))
        );
        const truncate = (text: string, max: number) =>
          text.length > max ? text.substring(0, max - 1) + '\u2026' : text;

        const textEl = g.append('text')
          .attr('class', 'bubble-label')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', fontSize)
          .attr('font-weight', '600')
          .attr('fill', 'white')
          .attr('pointer-events', 'none');

        let line1 = '', line2 = '', line1Full = false;
        words.forEach(w => {
          if (!line1Full && (line1 + ' ' + w).trim().length * (fontSize * 0.6) < maxW) {
            line1 = (line1 + ' ' + w).trim();
          } else { line1Full = true; line2 = (line2 + ' ' + w).trim(); }
        });

        if (line2) {
          const y1 = hasEP ? d.r * 0.0 : d.r * 0.1;
          textEl.append('tspan').attr('x', 0).attr('y', y1).text(truncate(line1, charsPerLine));
          textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(truncate(line2, charsPerLine));
        } else {
          textEl.attr('y', hasEP ? d.r * 0.1 : d.r * 0.08).text(truncate(d.todo.title, charsPerLine));
        }

        // E·P indicator (only for larger bubbles)
        if (hasEP) {
          g.append('text')
            .attr('class', 'bubble-label')
            .attr('text-anchor', 'middle')
            .attr('y', d.r * 0.62)
            .attr('font-size', 9)
            .attr('fill', 'rgba(255,255,255,0.6)')
            .attr('pointer-events', 'none')
            .text(`E${d.todo.effort} · P${d.todo.priority}`);
        }
      }
    };

    // ── Text zone: title + E·P below the icon zone ────────────────────
    node.each(function(d) {
      renderLabel(d3.select<SVGGElement, BubbleDatum>(this), d, false);
    });

    // ── Hover: scale up + show full text ──────────────────────────────
    this.hoveredNodes.clear();

    node
      .on('mouseenter', (event, d) => {
        this.hoveredNodes.add(d);
        const g = d3.select<SVGGElement, BubbleDatum>(event.currentTarget as SVGGElement);
        g.raise();
        const { x, y } = clampPos(d);
        const hScale = hoverScaleFor(d.r);
        g.transition('hover').duration(180)
          .attr('transform', `translate(${x},${y}) scale(${hScale})`);
        g.selectAll('circle').transition('hover').duration(180)
          .style('filter', 'brightness(1.15)');
        renderLabel(g, d, true);
      })
      .on('mouseleave', (event, d) => {
        this.hoveredNodes.delete(d);
        const g = d3.select<SVGGElement, BubbleDatum>(event.currentTarget as SVGGElement);
        const { x, y } = clampPos(d);
        g.transition('hover').duration(180)
          .attr('transform', `translate(${x},${y}) scale(1)`);
        g.selectAll('circle').transition('hover').duration(180)
          .style('filter', null);
        renderLabel(g, d, false);
      });

    // ── Static positioning (packSiblings already computed final positions) ──
    // Apply positions immediately — no force simulation needed
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }
}
