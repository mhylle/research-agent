# Sparkline Component

Small inline SVG-based line charts that show score progression across evaluation attempts.

## Features

- **Compact Design**: 40x16px default size (configurable)
- **Animated Drawing**: Smooth left-to-right animation on load
- **Color-Coded Trends**: Moss (positive), Clay (negative), Slate (neutral)
- **Delta Indicators**: Shows percentage change with up/down arrows
- **Gradient Fill**: Subtle gradient from line color to transparent
- **Tooltips**: Hover to see all attempt scores

## Usage

### Basic Example

```typescript
<app-sparkline
  [data]="[42, 85, 100]"
  [showDelta]="true"
  deltaLabel="improvement">
</app-sparkline>
```

### With Custom Size

```typescript
<app-sparkline
  [data]="scores"
  [width]="80"
  [height]="24"
  [color]="#0891b2">
</app-sparkline>
```

### Without Delta Indicator

```typescript
<app-sparkline
  [data]="singleScore"
  [showDelta]="false">
</app-sparkline>
```

## Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `data` | `number[]` | `[]` | Array of numeric values (0-100 range) |
| `color` | `string` | auto | Custom line color (overrides trend-based coloring) |
| `width` | `number` | `40` | SVG width in pixels |
| `height` | `number` | `16` | SVG height in pixels |
| `showDelta` | `boolean` | `true` | Show percentage change indicator |
| `deltaLabel` | `string` | `'change'` | Label for delta indicator (e.g., "improvement") |

## Auto Color Selection

When `color` is not provided, the component automatically selects colors based on trend:

- **Moss** (#4d7c0f): Positive trend (delta > 0)
- **Clay** (#ea580c): Negative trend (delta < 0)
- **Slate** (#64748b): No change (delta = 0) or single value

## Data Format

The `data` array should contain percentage values in the 0-100 range:

```typescript
// Valid examples
[42, 85, 100]           // Three attempts showing improvement
[95, 90, 85]            // Declining scores
[80]                    // Single value
[]                      // Empty (component shows nothing)
```

## Delta Calculation

The delta is calculated as: `last_value - first_value`

```typescript
data = [42, 85, 100]
delta = 100 - 42 = 58% improvement
```

## Tooltip Format

Hover over the sparkline to see all attempts:

```
Attempt 1: 42% → Attempt 2: 85% → Attempt 3: 100%
```

## Animation

The sparkline features two animations:

1. **Line Drawing** (0.6s): Line draws from left to right using SVG stroke animation
2. **Fill Fade-In** (0.4s): Gradient fill fades in after line completes (0.3s delay)

## Responsive Behavior

The sparkline uses `preserveAspectRatio="none"` to stretch horizontally while maintaining vertical proportions. This ensures consistent height across different data point counts.

## Integration Examples

### Circular Progress Card

```html
<div class="metric-card">
  <h3 class="metric-title">Query Accuracy</h3>
  <div class="circular-progress">
    <!-- Circular gauge here -->
  </div>
  <div class="sparkline-wrapper" *ngIf="getQueryAccuracySparkline().length > 1">
    <app-sparkline
      [data]="getQueryAccuracySparkline()"
      [width]="40"
      [height]="16"
      [showDelta]="true"
      deltaLabel="improvement">
    </app-sparkline>
  </div>
</div>
```

### Radar Chart Card

```html
<div class="card">
  <h3 class="card-title">Plan Evolution</h3>
  <div class="chart-container">
    <!-- Radar chart here -->
  </div>
  <div class="progression-sparkline" *ngIf="getOverallProgressionSparkline().length > 1">
    <span class="sparkline-label">Overall Progression</span>
    <app-sparkline
      [data]="getOverallProgressionSparkline()"
      [width]="80"
      [height]="24"
      [showDelta]="true"
      deltaLabel="improvement">
    </app-sparkline>
  </div>
</div>
```

## Styling

The component uses internal styles with Digital Hygge design principles:

- Moss (#4d7c0f) for positive trends
- Clay (#ea580c) for negative trends
- Slate (#64748b) for neutral
- Smooth rounded line joins
- Subtle gradient fill
- 11px font size for delta text

### Custom Wrapper Styles

```scss
.sparkline-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: #f9f7f4; // Oatmeal
  border-radius: 6px;
}

.progression-sparkline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f9f7f4; // Oatmeal
  border-radius: 8px;
}

.sparkline-label {
  font-size: 12px;
  font-weight: 500;
  color: #64748b; // Slate
}
```

## Performance Considerations

- **Lightweight**: Minimal DOM footprint with inline SVG
- **No Dependencies**: Pure Angular component using signals
- **Computed Properties**: Efficient reactive calculations
- **CSS Animations**: Hardware-accelerated animations

## Accessibility

- Tooltip provides text alternative via `title` attribute
- Color is not the only indicator (delta text and arrows)
- Sufficient color contrast for text elements
- Screen readers can access delta information

## Browser Support

Compatible with all modern browsers supporting:
- SVG 1.1
- CSS animations
- ES2015+ (via Angular)

## Testing

Run component tests:

```bash
npm run client:test -- --include='**/sparkline.spec.ts'
```

Test coverage includes:
- Delta calculation (positive, negative, zero)
- Color selection based on trend
- Tooltip generation
- Path generation (line and fill)
- Point normalization within viewBox
- Edge cases (empty data, single value)
