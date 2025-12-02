# Sparkline Visual Examples

## Overview
Visual representation of how sparklines appear in the Research Quality Inspector.

## 1. Circular Progress Card with Sparkline

```
┌────────────────────────────────────┐
│        Query Accuracy              │
│                                    │
│         ╭─────────╮                │
│        ╱           ╲               │
│       │     100%    │              │
│       │             │              │
│        ╲           ╱               │
│         ╰─────────╯                │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲          │ │
│  │╱                    ╲         │ │
│  │  ↑ +58% improvement           │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘

Visual breakdown:
- Top: Circular gauge showing final score (100%)
- Bottom: Sparkline showing progression (42% → 85% → 100%)
- Below sparkline: Delta indicator "↑ +58% improvement"
- Color: Green/Moss (#4d7c0f) for positive trend
```

## 2. Radar Chart Card with Sparkline

```
┌────────────────────────────────────┐
│         Plan Evolution             │
│        [Regenerated]               │
│                                    │
│              ╱╲                    │
│            ╱    ╲                  │
│          ╱        ╲                │
│        ╱            ╲              │
│      ╱   [Radar]     ╲            │
│      ╲   Chart       ╱            │
│        ╲            ╱              │
│          ╲        ╱                │
│            ╲    ╱                  │
│              ╲╱                    │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ Overall Progression           │ │
│  │ ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲          │ │
│  │╱                    ╲         │ │
│  │  ↑ +25% improvement           │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ Pivot Reason (Critique)       │ │
│  │ Initial plan lacked proper... │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘

Visual breakdown:
- Top: Regenerated badge showing plan was retried
- Middle: Radar chart comparing Attempt 1 vs Attempt 2
- Below chart: Sparkline showing overall progression
- Bottom: Critique explaining why pivot occurred
```

## 3. Sparkline Color Examples

### Positive Trend (Moss Green)
```
Data: [42, 70, 85, 100]
Delta: +58%

     ╱‾‾‾‾‾‾‾‾‾‾‾╲
   ╱              ╲
 ╱

Color: #4d7c0f (Moss)
Icon: ↑
Text: "+58% improvement"
```

### Negative Trend (Clay Orange)
```
Data: [95, 80, 65, 50]
Delta: -45%

╲
  ╲              ╱
   ╲___________╱

Color: #ea580c (Clay)
Icon: ↓
Text: "-45% decline"
```

### Neutral/Stable (Slate Gray)
```
Data: [75, 75, 75]
Delta: 0%

_______________

Color: #64748b (Slate)
Icon: =
Text: "0% change"
```

## 4. Complete Dashboard Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     Research Quality Inspector                              │
│  [abc-123-def]  [1m 23s]                                                   │
│  "What are the key features of semantic search?"                           │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Plan Evolution  │  │ Query Accuracy  │  │ Final Answer    │
│  [Regenerated]  │  │                 │  │  Quality        │
│                 │  │      100%       │  │ [Halluc: low]   │
│   [Radar Chart] │  │   ╭────────╮    │  │                 │
│  Attempt 1 vs 2 │  │  │  100%   │    │  │  [Radar Chart]  │
│                 │  │   ╰────────╯    │  │   6 metrics     │
│ ┌─────────────┐ │  │  ┌──────────┐   │  │                 │
│ │Overall Prog │ │  │  │ ╱‾‾‾╲    │   │  │ ┌─────────────┐ │
│ │ ╱‾‾‾‾╲      │ │  │  │╱     ╲   │   │  │ │Overall Qual │ │
│ │  ↑ +25%     │ │  │  │↑ +58% │   │  │ │ ╱‾‾‾╲        │ │
│ └─────────────┘ │  │  └──────────┘   │  │ │            │ │
│                 │  │                 │  │ └─────────────┘ │
│ [Critique...]   │  │ Context Recall  │  │ [Bar metrics]   │
│                 │  │      85%        │  │ Relevance: 92%  │
│                 │  │   ╭────────╮    │  │ Accuracy:  88%  │
│                 │  │  │   85%   │    │  │ Faith:     95%  │
│                 │  │   ╰────────╯    │  │                 │
│                 │  │  ┌──────────┐   │  │                 │
│                 │  │  │ (single) │   │  │                 │
│                 │  │  └──────────┘   │  │                 │
│                 │  │                 │  │                 │
│                 │  │ Retrieval Qual  │  │                 │
│                 │  │  [Radar Chart]  │  │                 │
│                 │  │   5 metrics     │  │                 │
│                 │  │ ┌─────────────┐ │  │                 │
│                 │  │ │Quality Score│ │  │                 │
│                 │  │ │ ╱‾‾‾╲       │ │  │                 │
│                 │  │ │            │ │  │                 │
│                 │  │ └─────────────┘ │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 5. Animation Sequence

```
Frame 1 (0.0s):
  [Empty sparkline background]

Frame 2 (0.2s):
  ╱
  [Line drawing begins]

Frame 3 (0.4s):
  ╱‾‾‾‾‾‾
  [Line continues drawing]

Frame 4 (0.6s):
  ╱‾‾‾‾‾‾‾‾‾‾‾╲
  [Line complete, fill begins]

Frame 5 (1.0s):
  ╱‾‾‾‾‾‾‾‾‾‾‾╲
 ╱█████████████╲
 [Fill complete with gradient]

Total duration: 1.0s
- Line drawing: 0.6s (cubic-bezier)
- Fill fade-in: 0.4s (starts at 0.3s)
```

## 6. Tooltip Example

```
┌────────────────────────────────────────┐
│ Attempt 1: 42% → Attempt 2: 85% →     │
│ Attempt 3: 100%                        │
└────────────────────────────────────────┘
     ↓
  ╱‾‾‾‾‾‾‾‾‾‾‾╲
 ╱             ╲  ← Hover here
```

## 7. Responsive Behavior

### Desktop (40px wide)
```
  ╱‾‾‾‾‾‾‾‾‾‾‾╲
 ╱             ╲
```

### Larger variant (80px wide)
```
  ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲
 ╱                       ╲
```

Height remains constant (16px or 24px) while width adjusts.

## 8. Integration Points

1. **Query Accuracy** (Circular Progress)
   - Position: Below circular gauge
   - Data: Plan attempt scores for queryAccuracy
   - Shows: Progression across attempts

2. **Context Recall** (Circular Progress)
   - Position: Below circular gauge
   - Data: Retrieval score for contextRecall
   - Shows: Single value (typically)

3. **Plan Evolution** (Radar Chart)
   - Position: Below radar chart
   - Data: Average of all plan metrics per attempt
   - Shows: Overall plan improvement

4. **Retrieval Quality** (Radar Chart)
   - Position: Below radar chart
   - Data: Average of all retrieval metrics
   - Shows: Overall retrieval quality

5. **Answer Quality** (Radar Chart)
   - Position: Below radar chart
   - Data: Average of all answer metrics
   - Shows: Overall answer quality

## 9. Color Palette (Digital Hygge)

```
Moss (Positive):   #4d7c0f ████
Clay (Negative):   #ea580c ████
Slate (Neutral):   #64748b ████
Oatmeal (BG):      #f9f7f4 ████
Stone (Card BG):   #ffffff ████
Charcoal (Text):   #1a1a1a ████
```

## 10. Size Variants

### Small (40x16px)
```
Default size for circular progress cards
     ╱‾‾╲
   ╱     ╲
```

### Medium (80x24px)
```
Used for radar chart cards
        ╱‾‾‾‾‾‾╲
      ╱         ╲
```

### Custom
```
Configurable via [width] and [height] inputs
```

## 11. Data Requirements

### Valid Data
```typescript
✓ [42, 85, 100]           // Multiple values
✓ [85]                    // Single value (no delta)
✓ [50, 50, 50]            // Stable (delta = 0)
✓ []                      // Empty (renders nothing)
```

### Invalid Data
```typescript
✗ null                    // Error
✗ undefined               // Error
✗ "42,85,100"             // Wrong type
✗ [null, 85, 100]         // Contains null
```

## 12. Delta Calculation Examples

```
[42, 85, 100]  → delta = 100 - 42 = +58%
[95, 80, 65]   → delta = 65 - 95  = -30%
[75, 75]       → delta = 75 - 75  = 0%
[50]           → delta = null (single value)
[]             → delta = null (no data)
```
