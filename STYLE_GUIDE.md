# Service Desk Frontend Style Guide

> **Last Updated:** January 8, 2026  
> **Design System:** shadcn/ui (New York style)  
> **Framework:** Astro + React with TypeScript

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Interactive States](#interactive-states)
7. [Accessibility](#accessibility)
8. [Code Conventions](#code-conventions)

---

## Design Philosophy

The Service Desk interface follows a **clean, professional, and functional** design language with these core principles:

- **Clarity over cleverness** - UI elements are immediately understandable
- **Consistency** - Repeated patterns create predictable user experiences
- **Accessibility-first** - WCAG 2.1 AA compliance with semantic HTML and ARIA
- **Performance-conscious** - Optimized interactions with minimal visual overhead
- **Subtle transitions** - Smooth state changes without distraction

---

## Color System

### Base Configuration

The design system uses **OKLCH color space** for perceptually uniform colors with CSS variables for theming.

#### Light Mode
```css
--background: oklch(1 0 0)                    /* Pure white */
--foreground: oklch(0.129 0.042 264.695)      /* Deep slate */
--primary: oklch(0.208 0.042 265.755)         /* Slate blue */
--primary-foreground: oklch(0.984 0.003 247.858)
--secondary: oklch(0.968 0.007 247.896)       /* Light gray */
--muted: oklch(0.968 0.007 247.896)
--muted-foreground: oklch(0.554 0.046 257.417)
--accent: oklch(0.968 0.007 247.896)
--destructive: oklch(0.577 0.245 27.325)      /* Red */
--border: oklch(0.929 0.013 255.508)
--ring: oklch(0.704 0.04 256.788)             /* Focus ring */
```

#### Dark Mode
```css
--background: oklch(0.129 0.042 264.695)      /* Deep slate */
--foreground: oklch(0.984 0.003 247.858)      /* Off-white */
--primary: oklch(0.929 0.013 255.508)         /* Light slate */
--card: oklch(0.208 0.042 265.755)            /* Elevated surface */
--muted: oklch(0.279 0.041 260.031)
--destructive: oklch(0.704 0.191 22.216)
--border: oklch(1 0 0 / 10%)                  /* Subtle borders */
```

### Semantic Color Usage

| Use Case | Token | Example |
|----------|-------|---------|
| Primary actions | `bg-primary text-primary-foreground` | Submit buttons, key CTAs |
| Destructive actions | `bg-destructive text-white` | Delete, remove operations |
| Subtle backgrounds | `bg-muted` or `bg-accent` | Card backgrounds, hover states |
| Borders | `border-border` | Dividers, card outlines |
| Secondary text | `text-muted-foreground` | Helper text, timestamps |
| Success states | `bg-green-500` | Status indicators |
| Warning states | `bg-orange-500` | Alert states |
| Error states | `bg-red-500` or `text-red-600` | Validation errors |

### Chart Colors
For data visualization, use the predefined chart palette:
- `--chart-1` through `--chart-5` provide consistent, accessible color schemes

---

## Typography

### Font System
- **Primary Font:** System font stack via Tailwind defaults
- **Font Smoothing:** Applied globally for crisp rendering

### Type Scale

| Element | Class | Size | Weight | Usage |
|---------|-------|------|--------|-------|
| Page Title | `text-lg font-medium` | 18px | 500 | Main headers |
| Section Header | `font-semibold` | 14px | 600 | Card titles, section labels |
| Body Text | `text-sm` | 14px | 400 | Standard content |
| Small Text | `text-xs` | 12px | 400 | Timestamps, helper text |
| Muted Text | `text-sm text-muted-foreground` | 14px | 400 | Secondary information |
| Labels | `text-sm font-medium` | 14px | 500 | Form labels |

### Text Colors
```tsx
// Primary content
className="text-foreground"

// Secondary/helper text
className="text-muted-foreground"

// Error messages
className="text-red-600"

// Success indicators
className="text-green-600"

// Links
className="text-primary underline-offset-4 hover:underline"
```

---

## Spacing & Layout

### Border Radius
```css
--radius: 0.625rem (10px)
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 10px
--radius-xl: 14px
```

**Standard usage:**
- Cards: `rounded-xl` (10px)
- Buttons: `rounded-md` (6px)
- Inputs: `rounded-md` (6px)
- Badges: `rounded-md` (6px)
- Small elements: `rounded-md` or `rounded-full`

### Standard Spacing

| Use Case | Class | Value |
|----------|-------|-------|
| Card padding | `p-6` | 24px |
| Card gaps | `gap-6` | 24px |
| Form sections | `gap-4` | 16px |
| Inline elements | `gap-2` | 8px |
| Tight spacing | `gap-1.5` | 6px |

### Layout Patterns

#### Application Shell
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header className="flex h-16 items-center gap-2">
      <SidebarTrigger />
      <Breadcrumb />
    </header>
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="bg-muted/50 flex-1 rounded-xl p-4">
        {/* Content */}
      </div>
    </div>
  </SidebarInset>
</SidebarProvider>
```

#### Card Layout
```tsx
<Card className="rounded-xl border bg-card shadow-sm">
  <CardHeader className="px-6">
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent className="px-6">
    {/* Content */}
  </CardContent>
</Card>
```

---

## Components

### Buttons

#### Variants
```tsx
// Primary action (default)
<Button>Submit</Button>
// bg-primary, text-primary-foreground, hover:bg-primary/90

// Destructive action
<Button variant="destructive">Delete</Button>
// bg-destructive, text-white, hover:bg-destructive/90

// Secondary action
<Button variant="secondary">Cancel</Button>
// bg-secondary, text-secondary-foreground

// Outline style
<Button variant="outline">Options</Button>
// border, bg-background, hover:bg-accent

// Ghost (minimal)
<Button variant="ghost">Menu</Button>
// hover:bg-accent only

// Link style
<Button variant="link">Learn More</Button>
// text-primary with underline
```

#### Sizes
```tsx
<Button size="sm">Small</Button>      // h-8, px-3
<Button size="default">Default</Button> // h-9, px-4
<Button size="lg">Large</Button>       // h-10, px-6
<Button size="icon">Icon</Button>      // size-9 square
```

### Form Inputs

#### Text Input
```tsx
<Input 
  type="text"
  placeholder="Enter text..."
  className="h-9 rounded-md border px-3"
/>
// Standard: h-9, shadow-xs, focus-visible:ring-[3px]
```

#### Labels
```tsx
<Label htmlFor="email" className="text-sm font-medium">
  Email
</Label>
```

#### Validation States
```tsx
// Error state
<Input aria-invalid="true" />
// Adds red border and ring-destructive/20

// With error message
<p className="text-xs text-red-600 mt-1" role="alert">
  {error}
</p>
```

### Cards

```tsx
// Standard card
<Card className="rounded-xl border bg-card shadow-sm">
  <CardHeader className="px-6 border-b">
    <CardTitle className="leading-none font-semibold">
      Card Title
    </CardTitle>
    <CardDescription className="text-sm text-muted-foreground">
      Supporting text
    </CardDescription>
  </CardHeader>
  <CardContent className="px-6">
    {/* Content */}
  </CardContent>
  <CardFooter className="px-6 border-t pt-6">
    {/* Actions */}
  </CardFooter>
</Card>
```

### Badges

```tsx
// Status badges
<Badge variant="default">Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Draft</Badge>

// Custom status colors
<div className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
  Resolved
</div>
<div className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
  Open
</div>
```

### Attachments

```tsx
<button className="inline-flex items-center gap-2 rounded-md bg-accent px-2.5 py-1 text-xs hover:bg-accent/80 disabled:opacity-50 transition-colors">
  📎 filename.pdf
</button>
```

### Avatars

```tsx
// With fallback
<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
  AB
</div>
```

### Modals/Dialogs

```tsx
// Backdrop
<div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
  {/* Dialog content */}
  <div className="bg-white rounded-lg shadow-xl max-w-2xl">
    <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
      <span className="text-sm font-medium">Title</span>
      <button>Close</button>
    </div>
    {/* Content */}
  </div>
</div>
```

---

## Interactive States

### Focus States
All interactive elements use visible focus rings:
```css
focus-visible:border-ring 
focus-visible:ring-ring/50 
focus-visible:ring-[3px]
```

### Hover States
```tsx
// Buttons
hover:bg-primary/90

// Accent backgrounds
hover:bg-accent hover:text-accent-foreground

// Ghost buttons
hover:bg-accent/50

// Links
hover:underline
```

### Disabled States
```tsx
disabled:pointer-events-none 
disabled:opacity-50
disabled:cursor-not-allowed
```

### Loading States
```tsx
// Spinner
<RefreshCw className="h-8 w-8 animate-spin text-primary" />

// Skeleton (from shadcn/ui)
<Skeleton className="h-4 w-full" />
```

### Transitions
```tsx
// Standard
transition-colors

// All properties
transition-all

// Custom
transition-[color,box-shadow]
```

---

## Accessibility

### Semantic HTML
- Use proper heading hierarchy (`h1`, `h2`, `h3`)
- Use `<button>` for actions, `<a>` for navigation
- Use `<label>` with form inputs
- Use semantic elements (`<nav>`, `<main>`, `<article>`)

### ARIA Attributes
```tsx
// Labels
<button aria-label="Close dialog">×</button>

// States
<button aria-pressed={isActive}>Toggle</button>
<input aria-invalid={hasError} />

// Live regions
<div role="alert">{errorMessage}</div>
<div aria-live="polite">{statusUpdate}</div>

// Descriptions
<time dateTime={isoDate}>{formattedDate}</time>
```

### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Logical tab order (no `tabindex` > 0)
- Visible focus indicators
- Escape key closes modals/dropdowns

### Screen Reader Support
- Meaningful alt text for images
- `aria-label` for icon-only buttons
- Status messages in live regions
- Descriptive link text (avoid "click here")

---

## Code Conventions

### Component Structure
```tsx
/**
 * Component Name
 * 
 * Brief description of purpose and key features:
 * - Feature 1
 * - Feature 2
 * - Accessibility considerations
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface ComponentProps {
  // Props with JSDoc comments
}

export const Component: React.FC<ComponentProps> = ({ props }) => {
  const { t } = useTranslation('namespace');
  
  // Component logic
  
  return (
    // JSX
  );
};
```

### Styling Patterns

#### Use Tailwind utility classes
```tsx
// Good ✅
<div className="flex items-center gap-2 rounded-md bg-accent px-3 py-2">

// Avoid ❌
<div style={{ display: 'flex', gap: '8px' }}>
```

#### Conditional classes with cn()
```tsx
import { cn } from "@/lib/utils";

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  variant === "primary" && "primary-classes",
  className // Allow prop overrides
)} />
```

#### Component variants with CVA
```tsx
import { cva, type VariantProps } from "class-variance-authority";

const variants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "default-classes",
        secondary: "secondary-classes"
      },
      size: {
        sm: "sm-classes",
        md: "md-classes"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);
```

### File Organization
```
components/
├── ui/                    # Primitive components (shadcn/ui)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── ...
├── ComponentName.tsx      # Feature components
└── feature-name.tsx       # Feature-specific components
```

### Import Aliases
```tsx
import { Component } from "@/components/ui/component"
import { util } from "@/lib/utils"
import { hook } from "@/hooks/use-hook"
import type { Type } from "@/types/types"
```

### TypeScript Types
```tsx
// Use TypeScript interfaces for props
interface Props {
  required: string;
  optional?: number;
  callback: (value: string) => void;
}

// Use React types
React.FC<Props>
React.ComponentProps<"button">
React.HTMLAttributes<HTMLDivElement>
```

---

## Design Tokens Reference

### Shadows
```css
shadow-xs    /* Subtle depth */
shadow-sm    /* Card elevation */
shadow-xl    /* Modal/popover */
```

### Opacity
```css
opacity-50   /* Disabled states */
opacity-80   /* Hover states */
/80          /* Color with 80% opacity (bg-primary/80) */
```

### Icon Library
**Lucide React** - Consistent 24×24px stroke icons
```tsx
import { Mail, User, Settings } from 'lucide-react';

<Mail className="h-4 w-4" />
<Settings className="size-5" />
```

### Responsive Design
```tsx
// Mobile-first approach
<div className="hidden md:block">Desktop only</div>
<div className="md:hidden">Mobile only</div>

// Breakpoints
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
```

---

## Examples from Codebase

### Email Thread Message
```tsx
<div className="flex gap-3 group">
  <Avatar className="h-8 w-8 bg-primary/10 text-primary" />
  <div className="flex-1">
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-foreground">
        {sender}
      </p>
      <time className="text-xs text-muted-foreground">
        {formatDate(date)}
      </time>
    </div>
    <ParsedEmailContent html={body} />
  </div>
</div>
```

### Form Group
```tsx
<div className="grid gap-2">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email"
    type="email"
    placeholder="user@example.com"
  />
  {error && (
    <p className="text-xs text-red-600" role="alert">
      {error}
    </p>
  )}
</div>
```

### Loading State
```tsx
{loading ? (
  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
) : (
  <Content />
)}
```

---

## Summary

This Service Desk frontend uses a **modern, accessible, and consistent design system** built on:

- **shadcn/ui** components (New York style)
- **Tailwind CSS** with OKLCH color space
- **Semantic HTML** with comprehensive ARIA support
- **TypeScript** for type safety
- **Lucide React** for icons
- **i18next** for internationalization

The design prioritizes **clarity, accessibility, and maintainability** while providing a clean, professional interface for customer support operations.

---

*For component-specific implementation details, refer to the individual component files in `/src/components/` and `/src/components/ui/`.*
