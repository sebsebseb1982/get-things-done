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
    :host ::ng-deep .bubble circle { transition: filter 0.15s; }
    :host ::ng-deep .bubble:hover circle { filter: brightness(1.15); }
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
    const rScale = d3.scaleSqrt().domain([1, 5]).range([
      Math.min(width, height) * 0.045,
      Math.min(width, height) * 0.13,
    ]);

    // Score: high priority + low effort + near deadline = top of screen
    // max base = 5×5 = 25, max deadline bonus = 50 → max total = 75
    const maxScore = 75;
    const yTarget = d3.scaleLinear()
      .domain([0, maxScore])
      .range([height * 0.88, height * 0.1]);  // low score → bottom, high score → top

    const data: BubbleDatum[] = this.todos.map((t, i) => ({
      todo: t,
      r: rScale(t.effort),
      score: t.priority * (6 - t.effort) + this.deadlineBonus(t.deadline, t.effort),
      // initial position: spread horizontally, stacked toward target Y
      x: (width / (this.todos.length + 1)) * (i + 1),
      y: yTarget(t.priority * (6 - t.effort) + this.deadlineBonus(t.deadline, t.effort)),
    }));

    // ── Layout labels: two axis indicators ────────────────────────────
    const labelG = svg.append('g').attr('opacity', 0.25);

    // Vertical axis label
    ['← Quick wins & urgent', '← Low priority'].forEach((txt, i) => {
      labelG.append('text')
        .attr('x', 10)
        .attr('y', i === 0 ? 22 : height - 8)
        .attr('font-size', 11)
        .attr('fill', '#9ca3af')
        .text(txt);
    });

    // Gradient background hint (top lighter → bottom darker)
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', 'bg-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#1f2937').attr('stop-opacity', 0.5);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#111827').attr('stop-opacity', 0.8);

    svg.insert('rect', ':first-child')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#bg-grad)');

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

    // Deadline warning badge (top-center, only when not done)
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

    // ── Helper: render title label (normal or hover state) ───────────
    const HOVER_SCALE = 1.85;

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
        const fontSize = Math.min(13, Math.max(9, d.r / 3.2));
        const words = d.todo.title.split(' ');
        const maxW = d.r * 1.6;
        const hasEP = d.r > 38;
        const effortCap: Record<number, number> = { 1: 8, 2: 11, 3: 14, 4: 17, 5: 20 };
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

        if (d.todo.effort === 1) {
          textEl.attr('y', d.r * 0.08).text(truncate(d.todo.title, charsPerLine));
          return;
        }

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
        g.transition('hover').duration(180)
          .attr('transform', `translate(${x},${y}) scale(${HOVER_SCALE})`);
        renderLabel(g, d, true);
      })
      .on('mouseleave', (event, d) => {
        this.hoveredNodes.delete(d);
        const g = d3.select<SVGGElement, BubbleDatum>(event.currentTarget as SVGGElement);
        const { x, y } = clampPos(d);
        g.transition('hover').duration(180)
          .attr('transform', `translate(${x},${y}) scale(1)`);
        renderLabel(g, d, false);
      });

    // ── Force simulation ───────────────────────────────────────────────
    // x-strength scales UP with bubble count: more bubbles → stronger pull to center
    const xStrength = Math.min(0.18, Math.max(0.05, data.length / 1000));
    this.simulation = d3.forceSimulation(data)
      .force('x', d3.forceX<BubbleDatum>(width / 2).strength(xStrength))
      .force('y', d3.forceY<BubbleDatum>((d) => yTarget(d.score)).strength(0.40))
      .force('collide', d3.forceCollide<BubbleDatum>((d) => d.r + 1.5).strength(0.9).iterations(4))
      .alphaDecay(0.03)
      .on('tick', () => {
        node.filter((d) => !this.hoveredNodes.has(d))
          .attr('transform', (d) => {
          // Clamp within SVG bounds
          const x = Math.max(d.r + 2, Math.min(width - d.r - 2, d.x ?? width / 2));
          const y = Math.max(d.r + 2, Math.min(height - d.r - 2, d.y ?? height / 2));
          return `translate(${x},${y})`;
        });
      });
  }
}
