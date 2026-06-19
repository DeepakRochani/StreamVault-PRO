---
name: Premium Utility
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#ebbbb4'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#b18780'
  outline-variant: '#603e39'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690100'
  primary-container: '#ff5540'
  on-primary-container: '#5c0000'
  inverse-primary: '#c00100'
  secondary: '#adc6ff'
  on-secondary: '#002e69'
  secondary-container: '#0070eb'
  on-secondary-container: '#fefcff'
  tertiary: '#ffafd2'
  on-tertiary: '#63003f'
  tertiary-container: '#ed5aa8'
  on-tertiary-container: '#570036'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930100'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a41'
  on-secondary-fixed-variant: '#004493'
  tertiary-fixed: '#ffd8e6'
  tertiary-fixed-dim: '#ffafd2'
  on-tertiary-fixed: '#3d0025'
  on-tertiary-fixed-variant: '#8b005a'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1200px
---

## Brand & Style

The brand personality is authoritative, high-performance, and frictionless. It aims to evoke a sense of professional-grade reliability and extreme speed, catering to power users who value high-fidelity media. 

The design style is **Modern Minimalist with Glassmorphic Accents**. It utilizes a deep, immersive dark theme to reduce eye strain and make 4K content previews pop. The interface relies on precision-engineered components, high-quality typography, and subtle translucency to communicate depth without clutter. The user experience is focused on "the task at hand"—parsing URLs and managing high-bandwidth data streams—while maintaining a premium, "pro-tool" aesthetic.

## Colors

The color palette is built upon a base of **Deep Slate (#0F172A)** to provide a sophisticated, low-light environment. 

- **Primary (YouTube Red):** Reserved for high-intent actions, critical errors, and the main branding elements related to video fetching.
- **Secondary (Facebook Blue):** Used for informational accents, secondary buttons, and steady-state progress indicators.
- **Tertiary (Instagram Magenta):** Applied to creative features, premium upgrades, or successful completion states to provide a vibrant contrast.
- **System Colors:** Success states use a vibrant Emerald; warnings use a bright Amber. 

Surface colors should use varying opacities of white (2% to 8%) over the slate background to create hierarchy.

## Typography

This design system uses a trio of sans-serif fonts to distinguish between brand impact and technical utility. 

**Hanken Grotesk** is used for headlines to provide a sharp, contemporary "tech" feel. **Inter** handles all body copy for maximum legibility during long sessions. **Geist** is employed for labels, metadata, and status readouts to reinforce the precision-tool aesthetic.

Avoid using weights below 400. For 4K resolution labels and file sizes, use the `mono-sm` token to ensure numerical data remains aligned and easy to scan.

## Layout & Spacing

The design system utilizes a **8px soft-grid system**. All margins, paddings, and component heights should be multiples of 4px or 8px to maintain visual rhythm.

- **Desktop:** 12-column fluid grid with a max-width of 1200px. Gutters are fixed at 24px.
- **Mobile:** Single column layout with 16px side margins. 
- **Density:** High-density spacing is preferred in the "Download Queue" to allow users to monitor multiple streams simultaneously, while low-density "hero" spacing is used for the URL input area.

Use generous vertical spacing (48px+) between major functional sections (Input vs. Results vs. History).

## Elevation & Depth

Hierarchy is established through **Glassmorphism** and **Tonal Layering** rather than traditional heavy shadows.

1.  **Background (Level 0):** Solid Deep Slate.
2.  **Cards/Containers (Level 1):** 4% White tint with a 16px Backdrop Blur and a 1px subtle border (10% White) to define edges.
3.  **Modals/Popovers (Level 2):** 8% White tint with 32px Backdrop Blur and a soft, 20% opacity black shadow to lift the element from the stack.

Progress bars should appear "inset" using a dark, desaturated inner-shadow to create a sense of physical tracks.

## Shapes

The shape language is characterized by **Generous Rounding (2xl)**. 

Primary containers and video thumbnails use a 1.5rem (24px) corner radius to soften the technical nature of the app. Smaller interactive elements like buttons and input fields follow a 0.75rem (12px) radius. Selection indicators (e.g., quality chips) use a pill shape (full rounding) to differentiate them from functional containers.

## Components

### Buttons
- **Primary:** Solid primary color with white text. No gradient. High-contrast.
- **Secondary:** Transparent background with a 1px white border (20% opacity).
- **Icon Buttons:** Circular with a subtle glass background.

### Input Fields
- Darker than the background surface with a 1px border that illuminates in the primary color upon focus. Text is always vertically centered.

### Progress Indicators
- **Track:** 8px height, rounded, deep grey.
- **Fill:** A vibrant gradient moving from Blue to Magenta to represent "active data."
- **Status Labels:** Displayed in `mono-sm` font for bitrates and percentage.

### Quality Chips
- Small, pill-shaped tags (e.g., "4K", "HDR", "1080p"). Use high-contrast backgrounds for 4K to denote premium quality.

### Cards (Download Items)
- Glassmorphic background. 
- Left-aligned thumbnail with 2xl rounded corners. 
- Right-aligned "Delete" or "Pause" actions using subtle ghost icons until hovered.
