# Digital Hygge Design Guide

**Philosophy**: "Digital Hygge." The interface should feel calm, warm, and structured. It balances the precision of architecture with the warmth of natural materials.

---

## 1. Core Pillars

**Warm Minimalism**: We avoid sterile white (#ffffff) and cold black (#000000). The base is always tinted (Warm Grey, Cream, Off-White).

**Matte Surfaces**: No gloss, no neon glow. Elements look like they are made of matte paper or stone.

**Typography as Structure**: We use a Serif font for structural elements (Names, Headers) to break the "Tech" feel, and Sans-Serif for the content.

---

## 2. Color Palette (The Fjord)

A palette inspired by Danish nature and interior design.

### Surfaces

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Oatmeal | `#f5f5f4` | Stone 100 | Main Background |
| Stone | `#e7e5e4` | Stone 200 | Secondary Panels |
| Charcoal | `#292524` | Stone 800 | Primary Text |

### Accents (Organic)

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Moss | `#4d7c0f` | Green 700 | Primary Action / Online / Success |
| Clay | `#ea580c` | Orange 600 | Highlights / Notifications / Errors |
| Slate | `#64748b` | Slate 500 | Secondary Text |
| Violet | `#7c3aed` | Violet 600 | LLM / AI indicators |

### Node Type Colors (Visualization)

| Type | Color | Hex |
|------|-------|-----|
| Stage | Blue | `#3b82f6` |
| Tool | Slate | `#64748b` |
| LLM | Violet | `#7c3aed` |
| Retry | Clay | `#ea580c` |
| Session | Blue | `#3b82f6` |
| Phase | Violet | `#8b5cf6` |
| Step | Green | `#10b981` |

### Status Colors

| Status | Color | Hex |
|--------|-------|-----|
| Pending | Stone | `#a8a29e` |
| Running | Moss | `#4d7c0f` |
| Completed | Moss | `#4d7c0f` |
| Error | Clay | `#ea580c` |
| Retrying | Clay | `#ea580c` |

---

## 3. Typography

### Headings
**Font**: Merriweather or Playfair Display (Serif)
- Adds sophistication and authority
- Used for: Page titles, Section headers, Card titles

### Body
**Font**: Inter or Lato (Sans-Serif)
- Clean and functional
- Used for: Content text, Labels, Descriptions

### Code
**Font**: Fira Code or JetBrains Mono (Monospace)
- Used for: JSON viewers, Code snippets, Technical data

---

## 4. Component Architecture

### Border Radius
`rounded-2xl` (Soft, organic curves, but not circles)

### Borders
No borders on cards. We use **Spacing** and **Soft Shadows** to define separation.

### Shadows
Large, diffuse, ambient shadows:
```css
shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]
```

### Cards
```scss
.card {
  background: #f5f5f4;  // Oatmeal
  border-radius: 1rem;  // rounded-2xl
  padding: 1.5rem;
  box-shadow: 0 20px 40px -15px rgba(0,0,0,0.1);
}
```

---

## 5. Interaction

### States
Subtle background shifts: **Oatmeal → Stone**

### Feel
Quiet and substantial.

### Hover Effects
```scss
.interactive-element {
  transition: background-color 300ms cubic-bezier(0.2, 0.0, 0, 1.0);

  &:hover {
    background-color: #e7e5e4;  // Stone
  }
}
```

### Focus States
```scss
.focusable {
  &:focus {
    outline: 2px solid #4d7c0f;  // Moss
    outline-offset: 2px;
  }
}
```

---

## 6. Motion (The Breeze)

Animation is never flashy. It mimics the physics of heavy, quality materials (wood, heavy curtains).

### Timing
**Unhurried**. Standard transitions are **300ms–500ms**.

### Easing
**Custom "Friction" curve**:
```css
cubic-bezier(0.2, 0.0, 0, 1.0)
```

### Entrances
Elements "settle" in:
- Fade in: 0% → 100%
- Drift upward: 10px → 0px

```scss
@keyframes settle-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.entering {
  animation: settle-in 400ms cubic-bezier(0.2, 0.0, 0, 1.0);
}
```

### Hover
Like a light dimmer, not a switch.

---

## 7. Iconography (Artisan Lines)

Icons feel like technical drawings or sketches.

### Style
**Monoline** (Stroke-based)

### Stroke Weight
**1.5px to 2px** (Matches Body font weight)

### Terminals
Round caps and joins

### Color
- **Slate** (`#64748b`) - Inactive
- **Charcoal** (`#292524`) - Active

### Recommended Libraries
- Lucide
- Phosphor (Thin/Light)

---

## 8. Imagery & Texture (Raw Material)

### Photography
Natural light, candid, soft shadows.

### Grain
A practically invisible noise texture (2% opacity) applied to the Oatmeal background to mimic paper and reduce digital glare.

```css
.textured-background {
  background-image: url('noise.png');
  background-blend-mode: overlay;
  opacity: 0.02;
}
```

### Corner Treatment
Images inside cards inherit the `rounded-xl` radius.

---

## 9. Layout Philosophy (The Hearth)

### Whitespace as Luxury
Margins are doubled. Large gaps of **64px or 96px**.

### Asymmetry
Content is allowed to be slightly offset (non-grid locked) to feel organic and "arranged."

### Max-Width
Text lines are kept short: **60-75 characters**.

```scss
.readable-text {
  max-width: 65ch;
}
```

### Spacing Scale
```scss
$spacing: (
  xs: 0.25rem,   // 4px
  sm: 0.5rem,    // 8px
  md: 1rem,      // 16px
  lg: 1.5rem,    // 24px
  xl: 2rem,      // 32px
  2xl: 3rem,     // 48px
  3xl: 4rem,     // 64px
  4xl: 6rem,     // 96px
);
```

---

## 10. Feedback & Micro-interactions

### The Press
Buttons do not ripple. They scale down slightly (`scale(0.98)`), mimicking the physical depression of a key.

```scss
.button {
  transition: transform 150ms cubic-bezier(0.2, 0.0, 0, 1.0);

  &:active {
    transform: scale(0.98);
  }
}
```

### Loaders
"Breathing" pulse. Opacity shifts gently from **Stone 200** to **Stone 100**.

```scss
@keyframes breathe {
  0%, 100% {
    background-color: #e7e5e4;  // Stone 200
  }
  50% {
    background-color: #f5f5f4;  // Stone 100
  }
}

.loader {
  animation: breathe 2s ease-in-out infinite;
}
```

---

## 11. Data Visualization

### Graph Colors
Follow the Node Type Colors palette above.

### Animated Effects
- **Particle flow**: Small circles flowing along edges (4px diameter, Moss color)
- **Pulsing glow**: Active nodes emit soft glow rings (SVG filter)
- **Smooth transitions**: Use 60fps animations with `requestAnimationFrame`

### Tooltips
- Background: Charcoal with 95% opacity
- Text: White
- Border radius: `rounded-lg`
- Shadow: Soft drop shadow
- Animation: Fade in with settle-in animation

```scss
.tooltip {
  background: rgba(41, 37, 36, 0.95);  // Charcoal
  color: white;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
}
```

---

## 12. Accessibility

### Color Contrast
All text meets WCAG AA standards:
- Charcoal on Oatmeal: 13.1:1 ratio
- Slate on Oatmeal: 4.6:1 ratio (AA compliant)

### Focus Indicators
Visible 2px Moss outline on all focusable elements.

### Motion Preferences
Respect `prefers-reduced-motion`:
```scss
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Quick Reference

### CSS Variables
```css
:root {
  /* Surfaces */
  --color-oatmeal: #f5f5f4;
  --color-stone: #e7e5e4;
  --color-charcoal: #292524;

  /* Accents */
  --color-moss: #4d7c0f;
  --color-clay: #ea580c;
  --color-slate: #64748b;
  --color-violet: #7c3aed;

  /* Typography */
  --font-heading: 'Merriweather', serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'Fira Code', monospace;

  /* Motion */
  --ease-friction: cubic-bezier(0.2, 0.0, 0, 1.0);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  /* Shadows */
  --shadow-soft: 0 20px 40px -15px rgba(0,0,0,0.1);
  --shadow-tooltip: 0 10px 25px -5px rgba(0,0,0,0.2);
}
```

### Tailwind Config Extensions
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        oatmeal: '#f5f5f4',
        charcoal: '#292524',
        moss: '#4d7c0f',
        clay: '#ea580c',
      },
      fontFamily: {
        heading: ['Merriweather', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      transitionTimingFunction: {
        friction: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
      },
    },
  },
};
```
