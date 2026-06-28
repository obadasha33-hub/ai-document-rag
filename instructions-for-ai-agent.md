# Target File: instructions-for-ai-agent.md

You are an expert Frontend Architect and WebGL/3D UI Specialist. Your task is to build a high-performance landing page featuring an immersive, interactive 3D scene inspired by organic, cosmic fluid particle networks. 

Implement this feature using React, Three.js / React Three Fiber (or a full-viewport Spline runtime deployment), integrated seamlessly with a Tailwind CSS architecture.

---

## 1. 3D Scene Specification & Creative Freedom

* **Core Aesthetic:** A high-density, dynamic 3D particle system behaving like a fluid nebula or abstract organic energy core. 
* **Color Palette:** Dominated by deep cosmic purples (`#6B21A8`), luminous electric blues (`#3B82F6`), and vibrant neon magenta/pink (`#EC4899`) accents interacting on a pitch-black or ultra-dark canvas base.
* **Material & Lighting:** Use highly emissive materials for the particles. Implement bloom filters, post-processing effects, and depth-of-field to give the particles a volumetric, glowing aura.
* **Creative Expansion:** Do not just duplicate a static frame. Enhance the visual depth by adding subtle, mouse-responsive gravity fields (particles slowly warp or gravitate toward the cursor position) and an underlying continuous noise function (e.g., 3D Simplex/Perlin noise) causing the structure to twist and breathe organically over time.

---

## 2. Layout & Full-Page Integration

* **Canvas Geometry:** The 3D canvas must fill the entire viewport (`width: 100vw`, `height: 100vh`). Position it as a fixed or absolute background (`z-index: 0`).
* **HTML Structure:** Place all text content, navigation, and call-to-action (CTA) elements in an overlay container (`z-index: 10`, `pointer-events: none`). Ensure all interactive components (buttons, links) explicitly reset to `pointer-events: auto`.
* **Performance Optimization:** Ensure the canvas handles resizing seamlessly without breaking aspect ratio or triggering layout thrashing. Cap the device pixel ratio at `Math.min(window.devicePixelRatio, 2)` to avoid performance drops on high-density displays.

---

## 3. Multi-Theme Typography & Readability Engine

To maintain accessibility (WCAG AA/AAA compliance) across all implemented themes (Dark, Light, Custom) while overlaying a luminous, multi-colored 3D asset, execute the following layout and design tokens:

### A. Dynamic Contrast Logic
* Because the 3D asset contains bright magenta and blue clusters, standard solid text may lose contrast depending on particle movement. 
* Apply text backdrops using a refined `backdrop-blur-md` mixed with a subtle, semi-transparent background tone (e.g., `bg-background/40`) to create an isolated legibility layer behind text elements.
* Alternatively, utilize CSS mix-blend modes (`mix-blend-mode: difference` or `mix-blend-mode: exclusion`) if it matches the creative layout execution.

### B. Typography Color Matrix per Theme

| Theme | Element | CSS Token / Variable | Implementation Rule |
| :--- | :--- | :--- | :--- |
| **Dark Mode** | Headings | `text-slate-50` / `#F8FAFC` | High emittance, sharp contrast against dark canvas. |
| | Paragraphs | `text-slate-300` / `#CBD5E1` | Desaturated to prevent visual fatigue. |
| | Accent / CTAs | `bg-pink-600` / `text-white` | Vibrancy matching the pink nebula highlights. |
| **Light Mode** | Headings | `text-slate-900` / `#0F172A` | Absolute high-contrast slate. Requires canvas background attenuation. |
| | Paragraphs | `text-slate-700` / `#334155` | Legible text density. |
| | Accent / CTAs | `bg-purple-600` / `text-white` | Deep saturated tones for actionable assets. |

### C. Implementation Strategy
* Control all typography colors using centralized theme tokens (CSS Variables) mapped into Tailwind configurations (`var(--foreground)`, `var(--primary)`, etc.).
* When a user switches themes, adjust the 3D scene's background clearing color and particle opacity to maintain a unified visual harmony (e.g., reduce particle emission intensity slightly in light mode to maintain dark-on-light text readability).
