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
import { Todo, TODO_CATEGORIES } from '../../models/todo.model';

/** A radius animation in flight (a bubble inflating, or popping). */
interface RadiusAnim {
  from: number;
  to: number;
  start: number;
  dur: number;
  ease: (t: number) => number;
  exit?: boolean;
}

interface BubbleNode extends d3.SimulationNodeDatum {
  key: string;     // join key: id, suffixed when the same id appears twice
  todo: Todo;
  score: number;   // priority × (6 - effort) → higher = more urgent / quick-win
  r: number;       // target radius — the size the contents are drawn at
  cr: number;      // current radius — animated on enter/exit, drives collision
  frac: number;    // 0 = dead centre, 1 = outer rim of the urgency ellipse
  tx: number;      // positional target — the ring, at the bubble's own bearing
  ty: number;
  hs: number;      // current hover scale
  hsTarget: number;
  anim: RadiusAnim | null;
  dead?: boolean;  // finished popping, awaiting removal from the DOM
}

// ── Animation timings (ms) ───────────────────────────────────────────
const ENTER_DUR = 620;  // a bubble inflating into the raft
const EXIT_DUR = 340;   // a bubble popping
const RESIZE_DUR = 420; // a bubble growing/shrinking after an effort change

// ── Layout ───────────────────────────────────────────────────────────
const FILL = 0.58;      // share of the viewport covered by bubble area
const GAP = 3;          // px kept between two bubble edges
// Surface tension: every bubble is pulled a little inside its own ring, so the
// raft is permanently under inward pressure and forceCollide (which only ever
// pushes apart) provides the counter-pressure. Without it nothing closes the
// hole left behind when a bubble pops.
const COMPACT = 0.7;
const EDGE_PAD = 12;
// A window drag fires the resize observer every frame. Re-sizing the <svg>
// box forces Chrome to re-lay-out and re-raster all ~700 nodes (~110ms a
// frame), so the box is only resized on this cadence, not continuously.
const RESIZE_THROTTLE = 120;

@Component({
  selector: 'app-bubble-chart',
  standalone: true,
  template: `
    <div class="relative w-full h-full">
      <svg #svg style="display:block"></svg>
      @if (todos.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center text-gray-500 text-xl">
          No todos yet — add your first task!
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    :host ::ng-deep .bubble { cursor: pointer; transition: opacity 240ms linear; }
  `],
  imports: [],
})
export class BubbleChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() todos: Todo[] = [];
  @Input() dimmedIds: Set<string> = new Set();
  @Output() editTodo = new EventEmitter<Todo>();
  @Output() toggleDone = new EventEmitter<Todo>();

  private el = inject(ElementRef);
  private zone = inject(NgZone);
  private resizeObserver!: ResizeObserver;
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResizeAt = 0;

  private nodes: BubbleNode[] = [];
  private sim?: d3.Simulation<BubbleNode, undefined>;
  private collide?: d3.ForceCollide<BubbleNode>;
  private frame?: d3.Timer;
  private bubbles?: d3.Selection<SVGGElement, BubbleNode, SVGGElement, unknown>;

  private width = 0;
  private height = 0;
  private hoveredKey: string | null = null;
  private firstRender = true;
  // Geometry of the previous render, used to carry the raft across a resize
  private prevCx = 0;
  private prevCy = 0;
  private prevRingX = 0;
  private prevRingY = 0;

  ngAfterViewInit(): void {
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.el.nativeElement);
  }

  /**
   * Throttled, with a trailing call: the chart follows a window drag in steps
   * instead of re-laying out on every frame, and always lands on the exact
   * final size.
   */
  private onResize(): void {
    const now = performance.now();
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (now - this.lastResizeAt >= RESIZE_THROTTLE) {
      this.lastResizeAt = now;
      this.zone.run(() => this.render());
    }
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.lastResizeAt = performance.now();
      this.zone.run(() => this.render());
    }, RESIZE_THROTTLE);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['todos'] && !changes['dimmedIds']) {
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
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.frame?.stop();
    this.sim?.stop();
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

  /** Relative bubble size for an effort, 1 (effort 1) → 2.12 (effort 5). */
  private sizeFactor(effort: number): number {
    return 1 + 0.9046 * (Math.sqrt(Math.max(1, effort)) - 1);
  }

  // ── One-time SVG skeleton: defs, background, guide layer, bubble layer ──
  private ensureLayers(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number,
  ): void {
    if (svg.select('g.layout').empty()) {
      svg.selectAll('*').remove();

      const defs = svg.append('defs');

      // Radial gradient background (center brighter → edge darker)
      const grad = defs.append('radialGradient')
        .attr('id', 'bg-grad')
        .attr('cx', '50%').attr('cy', '50%')
        .attr('r', '50%');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#1f2937').attr('stop-opacity', 0.6);
      grad.append('stop').attr('offset', '100%').attr('stop-color', '#111827').attr('stop-opacity', 0.9);

      // Grayscale filter for category watermark icons
      defs.append('filter').attr('id', 'cat-gray')
        .append('feColorMatrix')
        .attr('type', 'saturate')
        .attr('values', '0');

      // Glow filter for medal halos
      const glowFilter = defs.append('filter')
        .attr('id', 'medal-glow')
        .attr('x', '-40%').attr('y', '-40%')
        .attr('width', '180%').attr('height', '180%');
      glowFilter.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'coloredBlur');
      const feMerge = glowFilter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      svg.append('rect').attr('class', 'bg').attr('fill', 'url(#bg-grad)');
      svg.append('g').attr('class', 'guides').attr('pointer-events', 'none');
      svg.append('g').attr('class', 'layout');
    }

    svg.select('rect.bg').attr('width', width).attr('height', height);
  }

  // ── Concentric guide rings + radial labels ───────────────────────────
  private renderGuides(
    guides: d3.Selection<SVGGElement, unknown, null, undefined>,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    dur: number,
  ): void {
    guides.transition('guide-fade').duration(dur).attr('opacity', 1);

    guides.selectAll<SVGEllipseElement, number>('ellipse')
      .data([0.33, 0.66, 1.0])
      .join((enter) => enter.append('ellipse')
        .attr('cx', cx).attr('cy', cy)
        .attr('rx', (f) => rx * f).attr('ry', (f) => ry * f)
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '4 6')
        .attr('opacity', 0.12))
      .transition('guide').duration(dur).ease(d3.easeCubicOut)
      .attr('cx', cx).attr('cy', cy)
      .attr('rx', (f) => rx * f).attr('ry', (f) => ry * f);

    const label = (cls: string, text: string, y: number) => {
      let t = guides.select<SVGTextElement>(`text.${cls}`);
      if (t.empty()) {
        t = guides.append('text')
          .attr('class', cls)
          .attr('x', cx).attr('y', y)
          .attr('text-anchor', 'middle')
          .attr('font-size', 10)
          .attr('fill', '#9ca3af')
          .attr('opacity', 0.3)
          .attr('pointer-events', 'none');
      }
      t.text(text)
        .transition('guide').duration(dur).ease(d3.easeCubicOut)
        .attr('x', cx).attr('y', y);
    };

    label('guide-center', '● Urgent', cy - ry * 0.04);
    label('guide-outer', 'Low priority', cy - ry - 8);
  }

  // ── Bubble contents — drawn at the target radius, rebuilt only on change ──
  private renderContent(
    g: d3.Selection<SVGGElement, BubbleNode, any, any>,
    d: BubbleNode,
    rank: number | undefined,
    now: number,
  ): void {
    const sig = JSON.stringify(d.todo) + '|' + (rank ?? 0) + '|' + Math.round(d.r / 3);
    const el = g.node() as (SVGGElement & { __sig?: string }) | null;
    if (!el) return;
    if (el.__sig === sig) return;
    el.__sig = sig;

    g.selectAll('*').remove();

    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    // Native SVG tooltip — shows full title on hover
    g.append('title').text(d.todo.title);

    // ── Pulsing medal halo ring (rendered behind the main circle) ────────
    if (rank) {
      const ring = g.append('circle')
        .attr('r', d.r + 6)
        .attr('fill', 'none')
        .attr('stroke', medalColors[rank - 1])
        .attr('stroke-width', 2.5)
        .attr('filter', 'url(#medal-glow)')
        .attr('pointer-events', 'none');
      ring.append('animate')
        .attr('attributeName', 'stroke-opacity')
        .attr('values', '0.95;0.25;0.95')
        .attr('dur', '2.4s')
        .attr('repeatCount', 'indefinite');
    }

    // Circle
    g.append('circle')
      .attr('r', d.r)
      .attr('fill', this.priorityColor(d.todo.priority, d.todo.done))
      .attr('stroke', d.todo.done ? '#4b5563' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', 1.5);

    // Done dimming overlay
    if (d.todo.done) {
      g.append('circle').attr('r', d.r).attr('fill', 'rgba(0,0,0,0.5)');
    }

    // ── Category watermark (large monochrome icon centered behind text) ──
    if (d.todo.category) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('y', d.r * 0.12)
        .attr('font-size', d.r * 1.05)
        .attr('opacity', 0.13)
        .attr('filter', 'url(#cat-gray)')
        .attr('pointer-events', 'none')
        .text(TODO_CATEGORIES.find((c) => c.id === d.todo.category)?.icon ?? '');
    }

    // ── Top icon zone: ✓ when done, ⚠ / 🗓 when a deadline is set ────────
    const dl = d.todo.deadline;
    if (d.todo.done) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('y', -d.r * 0.52)
        .attr('font-size', Math.min(18, Math.max(10, d.r * 0.36)))
        .attr('fill', 'rgba(255,255,255,0.85)')
        .attr('pointer-events', 'none')
        .text('✓');
    } else if (dl) {
      const soon = new Date(dl).getTime() - now < threeDays;
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('y', -d.r * 0.52)
        .attr('font-size', Math.min(16, Math.max(10, d.r * 0.32)))
        .attr('fill', soon ? '#fbbf24' : 'rgba(255,255,255,0.75)')
        .attr('pointer-events', 'none')
        .text(soon ? '⚠' : '🗓');
    }

    // ── Medal rank badge for top-3 (top-right corner) ────────────────
    if (rank) {
      g.append('circle')
        .attr('cx', d.r * 0.62)
        .attr('cy', -d.r * 0.62)
        .attr('r', Math.max(9, d.r * 0.26))
        .attr('fill', medalColors[rank - 1])
        .attr('stroke', 'rgba(0,0,0,0.55)')
        .attr('stroke-width', 1.5)
        .attr('pointer-events', 'none');
      g.append('text')
        .attr('x', d.r * 0.62)
        .attr('y', -d.r * 0.62)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', Math.max(8, d.r * 0.23))
        .attr('font-weight', '800')
        .attr('fill', '#1a1a1a')
        .attr('pointer-events', 'none')
        .text(String(rank));
    }

    // ── Text zone: title + E·P below the icon zone ────────────────────
    const fontSize = Math.min(13, Math.max(7, d.r / 5.5));
    const words = d.todo.title.split(' ');
    const maxW = d.r * 1.6;
    const hasEP = d.r > 50;
    const effortCap: Record<number, number> = { 1: 16, 2: 16, 3: 18, 4: 22, 5: 24 };
    const charsPerLine = Math.min(
      effortCap[d.todo.effort] ?? 20,
      Math.max(3, Math.floor(maxW / (fontSize * 0.6))),
    );
    const truncate = (text: string, max: number) =>
      text.length > max ? text.substring(0, max - 1) + '…' : text;

    const textEl = g.append('text')
      .attr('class', 'bubble-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', fontSize)
      .attr('font-weight', '600')
      .attr('fill', 'white')
      .attr('pointer-events', 'none');

    let line1 = '', line2 = '', line1Full = false;
    words.forEach((w) => {
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

  private render(): void {
    const container = this.el.nativeElement as HTMLElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    const resized = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;

    const svg = d3.select<SVGSVGElement, unknown>(svgEl as SVGSVGElement);
    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);
    this.ensureLayers(svg, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const now = performance.now();

    // ── Score, rank and size every wanted todo ─────────────────────────
    // The join key must be unique per bubble; ids are expected to be unique,
    // but a dataset carrying the same id twice gets a stable occurrence suffix.
    const seen = new Map<string, number>();
    const wanted = this.todos.map((t) => {
      const n = seen.get(t.id) ?? 0;
      seen.set(t.id, n + 1);
      return {
        key: n === 0 ? t.id : `${t.id}#${n}`,
        todo: t,
        rho: this.sizeFactor(t.effort),
        score: t.done
          ? -1
          : t.priority * (6 - t.effort) + this.deadlineBonus(t.deadline, t.effort),
      };
    });

    // Radii are sized so the whole set covers a fixed share of the usable
    // disk. Adding or removing one todo nudges every radius slightly instead
    // of rescaling the layout, so nothing jumps.
    const usable = Math.min(width, height) / 2 - EDGE_PAD;
    const sumRho2 = wanted.reduce((a, d) => a + d.rho * d.rho, 0);
    const maxRho = wanted.reduce((a, d) => Math.max(a, d.rho), 1);
    const unit = Math.min(
      Math.sqrt((FILL * width * height) / (Math.PI * Math.max(1e-6, sumRho2))),
      Math.min(width, height) * 0.16 / maxRho,
    );

    // Rank by score: rank 0 sits at the centre, the last one at the rim.
    const ranked = [...wanted].sort((a, b) => b.score - a.score);
    const rankOf = new Map<string, number>();
    ranked.forEach((d, i) => rankOf.set(d.key, i));
    const count = wanted.length;
    // Urgency rings follow the viewport's aspect: on a wide window a circular
    // ring would push same-ranked bubbles to wildly different distances.
    const ringX = Math.max(1, width / 2 - EDGE_PAD - unit * 1.6);
    const ringY = Math.max(1, height / 2 - EDGE_PAD - unit * 1.6);
    // sqrt spreads the ranks evenly by area
    const fracFor = (rank: number) =>
      count <= 1 ? 0 : Math.sqrt((rank + 0.5) / count);

    // A resize maps the raft onto the new viewport — same bearings, same
    // relative distances. Re-settling from scratch on every resize event is
    // what used to drop the page to single-digit fps while dragging a window.
    if (resized && !this.firstRender && this.prevRingX > 0 && this.prevRingY > 0) {
      for (const n of this.nodes) {
        n.x = cx + (((n.x ?? this.prevCx) - this.prevCx) / this.prevRingX) * ringX;
        n.y = cy + (((n.y ?? this.prevCy) - this.prevCy) / this.prevRingY) * ringY;
        n.vx = 0;
        n.vy = 0;
      }
    }

    // ── Reconcile the persistent node list ─────────────────────────────
    const byKey = new Map(this.nodes.map((n) => [n.key, n]));
    const live: BubbleNode[] = [];
    const wantedKeys = new Set(wanted.map((d) => d.key));

    for (const d of wanted) {
      const rank = rankOf.get(d.key)!;
      const r = unit * d.rho;
      const frac = fracFor(rank);
      const existing = byKey.get(d.key);

      if (existing) {
        existing.todo = d.todo;
        existing.score = d.score;
        existing.frac = frac;
        if (existing.anim?.exit) {
          // It was popping and came back — inflate it again from where it is.
          existing.anim = { from: existing.cr, to: r, start: now, dur: ENTER_DUR, ease: d3.easeCubicOut };
        } else if (Math.abs(existing.r - r) > 0.5) {
          // Effort changed, or the viewport resized: ease to the new size.
          existing.anim = this.firstRender || resized
            ? null
            : { from: existing.cr, to: r, start: now, dur: RESIZE_DUR, ease: d3.easeCubicInOut };
          if (!existing.anim) existing.cr = r;
        }
        existing.r = r;
        existing.dead = false;
        live.push(existing);
        continue;
      }

      // New bubble: born on its own ring, at a golden angle so successive
      // arrivals spread out, then it inflates and shoulders its neighbours aside.
      const angle = rank * 2.399963229728653;
      live.push({
        tx: cx + Math.cos(angle) * frac * COMPACT * ringX,
        ty: cy + Math.sin(angle) * frac * COMPACT * ringY,
        key: d.key,
        todo: d.todo,
        score: d.score,
        r,
        cr: this.firstRender ? r : 0.01,
        frac,
        hs: 1,
        hsTarget: 1,
        anim: this.firstRender
          ? null
          : { from: 0.01, to: r, start: now, dur: ENTER_DUR, ease: d3.easeCubicOut },
        x: cx + Math.cos(angle) * (frac * ringX || 1),
        y: cy + Math.sin(angle) * (frac * ringY || 1),
      });
    }

    // A bubble keeps its bearing from one render to the next and only ever
    // adjusts its distance to the centre. Without this the layout is free to
    // rotate, and a single new todo sends the whole raft swirling.
    for (const n of live) {
      const dx = ((n.x ?? cx) - cx) / ringX;
      const dy = ((n.y ?? cy) - cy) / ringY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        n.tx = cx + (dx / dist) * n.frac * COMPACT * ringX;
        n.ty = cy + (dy / dist) * n.frac * COMPACT * ringY;
      }
    }

    // Whatever is no longer wanted pops: its collision radius collapses, and
    // the neighbours flow into the hole on their own.
    const leaving: BubbleNode[] = [];
    for (const n of this.nodes) {
      if (wantedKeys.has(n.key) || n.dead) continue;
      if (!n.anim?.exit) {
        n.anim = { from: n.cr, to: 0.01, start: now, dur: EXIT_DUR, ease: d3.easeBackIn.overshoot(1.7), exit: true };
        n.hsTarget = 1;
      }
      leaving.push(n);
    }
    if (this.hoveredKey && !wantedKeys.has(this.hoveredKey)) this.hoveredKey = null;

    this.nodes = [...live, ...leaving];

    // ── Forces ─────────────────────────────────────────────────────────
    if (!this.sim) {
      this.collide = d3.forceCollide<BubbleNode>().strength(0.9).iterations(2);
      this.sim = d3.forceSimulation<BubbleNode>()
        .force('collide', this.collide)
        .velocityDecay(0.5)
        .stop(); // ticked by our own frame loop
    }
    this.sim
      .force('x', d3.forceX<BubbleNode>((d) => d.tx).strength(0.08))
      .force('y', d3.forceY<BubbleNode>((d) => d.ty).strength(0.08))
      .nodes(this.nodes);

    if (this.firstRender) {
      // Nothing to carry over on the very first paint: settle synchronously
      // so the chart appears already at rest.
      this.sim.alpha(1);
      for (let i = 0; i < 260; i++) this.step(1);
    } else {
      // The rescaled raft only needs to relax into the new radii; the frame
      // loop does it over the next few frames.
      this.sim.alpha(resized ? 0.35 : 0.45);
    }

    // ── DOM ────────────────────────────────────────────────────────────
    this.syncDom(rankOf);
    this.renderGuides(
      svg.select<SVGGElement>('g.guides'),
      cx, cy,
      ringX,
      ringY,
      this.firstRender ? 0 : 400,
    );

    this.prevCx = cx;
    this.prevCy = cy;
    this.prevRingX = ringX;
    this.prevRingY = ringY;
    this.firstRender = false;
    this.paint();
    this.startLoop();
  }

  /** Keyed join of the persistent node list onto <g class="bubble"> elements. */
  private syncDom(rankOf?: Map<string, number>): void {
    const layer = d3.select<SVGSVGElement, unknown>(
      (this.el.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement,
    ).select<SVGGElement>('g.layout');

    const self = this;
    this.bubbles = layer
      .selectAll<SVGGElement, BubbleNode>('g.bubble')
      .data(this.nodes, (d) => d.key)
      .join((enter) => enter.append('g')
        .attr('class', 'bubble')
        .on('click', (_evt, d) => {
          if (self.clickTimer !== null) {
            // Second click within 250ms → double-click: toggle done
            clearTimeout(self.clickTimer);
            self.clickTimer = null;
            self.zone.run(() => self.toggleDone.emit(d.todo));
          } else {
            // First click: wait to see if a second follows
            self.clickTimer = setTimeout(() => {
              self.clickTimer = null;
              self.zone.run(() => self.editTodo.emit(d.todo));
            }, 250);
          }
        })
        .on('mouseenter', (evt, d) => {
          self.hoveredKey = d.key;
          d.hsTarget = self.hoverScaleFor(d.r);
          d3.select(evt.currentTarget as SVGGElement).raise();
          d3.select(evt.currentTarget as SVGGElement).selectAll('circle')
            .transition('hoverfx').duration(180).style('filter', 'brightness(1.15)');
          self.startLoop();
        })
        .on('mouseleave', (evt, d) => {
          if (self.hoveredKey === d.key) self.hoveredKey = null;
          d.hsTarget = 1;
          d3.select(evt.currentTarget as SVGGElement).selectAll('circle')
            .transition('hoverfx').duration(180).style('filter', null);
          self.startLoop();
        }));

    if (rankOf) {
      const now = Date.now();
      this.bubbles.each(function (d) {
        const rank = rankOf.get(d.key);
        self.renderContent(d3.select<SVGGElement, BubbleNode>(this), d, rank !== undefined && rank < 3 && !d.todo.done ? rank + 1 : undefined, now);
      });
    }

    const dimmed = this.dimmedIds;
    this.bubbles
      .attr('pointer-events', (d) => (d.anim?.exit ? 'none' : null))
      .attr('opacity', (d) => (d.anim?.exit ? 0 : dimmed.has(d.todo.id) ? 0.12 : 1));
  }

  // Hover scale is inversely proportional to radius: small bubbles zoom a lot
  // (to reach MIN_HOVER_R), large bubbles barely move.
  private hoverScaleFor(r: number): number {
    return Math.min(2.4, Math.max(1.04, 60 / Math.max(1, r)));
  }

  /**
   * One frame: advance the radius/hover animations, tick the simulation,
   * keep every bubble inside the viewport. Returns true while something moves.
   */
  private step(dtScale = 1): boolean {
    const now = performance.now();
    let inflating = false; // a radius is moving — the raft has to make room
    let easing = false;    // only a hover scale is moving — repaint, don't stir
    let reaped = false;

    for (const n of this.nodes) {
      if (n.anim) {
        const a = n.anim;
        const t = a.dur <= 0 ? 1 : Math.min(1, (now - a.start) / a.dur);
        n.cr = Math.max(0.01, a.from + (a.to - a.from) * a.ease(t));
        if (t >= 1) {
          n.cr = a.to;
          if (a.exit) { n.dead = true; reaped = true; }
          n.anim = null;
        } else {
          inflating = true;
        }
      }
      if (Math.abs(n.hs - n.hsTarget) > 0.002) {
        n.hs += (n.hsTarget - n.hs) * 0.18 * dtScale;
        easing = true;
      } else {
        n.hs = n.hsTarget;
      }
    }

    // Collision radius follows the animated radius — re-setting the accessor
    // makes d3 re-read it, which is what turns a pop into an inrush.
    this.collide?.radius((d) => d.cr + GAP);

    if (this.sim) {
      // Only a radius change keeps the simulation warm. Hovering must never
      // stir the layout, or every mouse-over would nudge the whole raft.
      this.sim.alphaTarget(inflating ? 0.1 : 0);
      // forceCollide resolves overlaps whatever alpha says, so a cold
      // simulation must not be ticked at all: a hover repaint would otherwise
      // keep nudging the raft every time the mouse crosses a bubble.
      if (inflating || this.sim.alpha() > this.sim.alphaMin()) {
        this.sim.tick();
        for (const n of this.nodes) {
          const m = n.cr + 1;
          n.x = Math.max(m, Math.min(this.width - m, n.x ?? this.width / 2));
          n.y = Math.max(m, Math.min(this.height - m, n.y ?? this.height / 2));
        }
      }
    }

    if (reaped) {
      this.nodes = this.nodes.filter((n) => !n.dead);
      this.sim?.nodes(this.nodes);
      this.syncDom();
    }

    return inflating || easing || (this.sim ? this.sim.alpha() > this.sim.alphaMin() : false);
  }

  /** Writes the current geometry to the DOM. */
  private paint(): void {
    if (!this.bubbles) return;
    const w = this.width;
    const h = this.height;
    const hovered = this.hoveredKey;
    this.bubbles.attr('transform', (d) => {
      const scale = (d.r > 0 ? d.cr / d.r : 0) * d.hs;
      let x = d.x ?? w / 2;
      let y = d.y ?? h / 2;
      if (d.key === hovered) {
        // Keep the magnified bubble fully on screen
        const m = d.r * d.hs + 2;
        x = Math.max(m, Math.min(w - m, x));
        y = Math.max(m, Math.min(h - m, y));
      }
      return `translate(${x},${y}) scale(${scale})`;
    });
  }

  /** Single rAF loop driving both the simulation and the animations. */
  private startLoop(): void {
    if (this.frame) return;
    this.zone.runOutsideAngular(() => {
      this.frame = d3.timer(() => {
        const busy = this.step();
        this.paint();
        if (!busy) {
          this.frame?.stop();
          this.frame = undefined;
        }
      });
    });
  }
}
