# IDC Energy Design System

## Direction

The Operations Hub is a premium operational instrument, not a generic dashboard. Its visual language comes from the IDC Energy logo: charcoal structure, warm paper surfaces, decisive red actions, and amber signals. Data remains visually dominant; brand colors explain hierarchy and state rather than decorate empty space.

The implementation source of truth is `idc-operations-hub/src/styles/globals.css`. This document explains how to apply those tokens consistently.

## Foundations

### Color

- **Charcoal** (`--idc-charcoal`) is the primary text and structural color.
- **Paper** (`--idc-paper`) is the application background. Prefer it to pure white.
- **IDC red** (`--idc-red`) identifies primary actions, active navigation, and critical emphasis.
- **IDC amber** (`--idc-amber`) identifies attention, pending work, and operational warnings.
- **Semantic colors** must use the `success`, `warning`, `info`, and `destructive` tokens. Do not communicate status by color alone.
- Use semantic aliases such as `bg-primary`, `text-muted-foreground`, and `border-border` in components. Do not add one-off hex values.

### Typography

- Use IBM Plex Sans Variable throughout the product.
- Use 400 for body copy, 500 for controls and labels, and 600 for headings and high-value data.
- Use tabular lining numerals for money, dates, quantities, identifiers, and table data.
- Keep headings compact and sentence-cased. Avoid oversized marketing typography inside authenticated workflows.

### Shape And Depth

- The base radius is 10px. Controls use the derived small and medium radii; cards and dialogs use the large radius.
- Prefer a border plus restrained shadow to heavy floating surfaces.
- Use `--shadow-control`, `--shadow-card`, `--shadow-popover`, and `--shadow-dialog` instead of custom shadows.
- Do not use glassmorphism, blurred panels, or decorative gradients in operational screens.

### Spacing

- Use a 4px base rhythm.
- Controls are normally 36px to 40px tall.
- Keep related form fields 12px to 16px apart and major content regions 24px to 32px apart.
- Dense tables are intentional, but every interactive target must remain at least 40px high on touch layouts.

## Components

### Navigation

The sidebar contains the core operating areas first: Transactions, Clients, and Suppliers. Employees and QuickBooks are admin-only utilities. Active navigation uses the red-tinted accent surface, clear text, and an explicit marker. Navigation labels and icons must remain visible at desktop widths; mobile uses the existing drawer pattern.

### Buttons

- **Primary**: one decisive action per region, such as creating a transaction or confirming an invoice.
- **Secondary/outline**: safe alternatives and supporting actions.
- **Destructive**: deletion, revocation, and irreversible actions only.
- Button labels should describe the outcome, not the interaction. Prefer "Create invoice" over "Submit".
- High-risk actions require a confirmation dialog with scope and consequence.

### Forms

Every field has a visible label, stable help or error placement, and a useful autocomplete value where applicable. Required fields are explicit. Validation errors explain how to recover and remain associated with their field. Preserve entered data after recoverable API errors.

### Tables

Tables are the primary work surface. Use tabular numerals, sticky or persistent context where useful, clear row hover/focus states, server-side pagination for growing datasets, and explicit empty/loading/error states. On narrow screens, preserve the most decision-relevant columns and expose secondary details without horizontal ambiguity.

### Cards And KPIs

Cards group related information, not every individual value. KPI cards use restrained accents and always include a text label. Avoid grids of interchangeable decorative cards when a table or compact summary communicates the state better.

### Status

Status badges combine text, color, and when useful an icon. Red means blocked, destructive, or critical; amber means attention or in progress; green means completed or healthy; blue means neutral information. Workflow status labels come from the shared workflow status module.

### Dialogs And Feedback

Dialogs have a single clear purpose, a descriptive title, an explicit close path, focus containment, and safe initial focus. Toasts acknowledge completed low-risk actions; persistent inline messages explain failures or states that still need attention. Never represent a QuickBooks outcome as successful until the backend confirms it.

## Motion

Use motion only to preserve context: dialog entry, disclosure, loading progression, or a short page reveal. Use `--ease-out-ui` and durations between 120ms and 240ms. Avoid `transition-all`. Honor `prefers-reduced-motion` and never make essential state depend on animation.

## Responsive Behavior

- Support widths from 320px upward.
- Desktop layouts may use persistent navigation and multi-column detail regions.
- Tablet layouts collapse secondary panels before compressing primary data.
- Mobile layouts stack forms, keep actions reachable, and avoid viewport-wide fixed controls that hide content.
- Test at 375px, 768px, 1280px, and 1440px before shipping a new workflow.

## Accessibility

Target WCAG 2.2 AA. Every workflow must work by keyboard, expose a visible focus ring, use semantic landmarks and labels, maintain contrast, announce asynchronous errors, and provide text in addition to color for status. Icon-only controls require accessible names. Loading skeletons must not obscure a real error or empty state.

## Change Rules

1. Reuse an existing semantic token or component variant before adding a new one.
2. Add new tokens to `globals.css`, Tailwind aliases when needed, and `DESIGN.json` in the same change.
3. Keep domain decisions out of visual primitives. Components should accept explicit state rather than infer accounting or workflow rules.
4. Verify desktop, mobile, keyboard, loading, empty, error, and permission states for every new workflow.
5. Ask whether the implementation is ETC: a future brand or workflow change should be achievable centrally, not through page-by-page edits.
