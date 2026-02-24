# Kundaro — Frontend

The **Kundaro** frontend is an [Astro](https://astro.build/) + React application that provides the user interface for the Kundaro customer-support platform.

## Tech Stack

- **Framework:** Astro (SSR) + React
- **Language:** TypeScript
- **Styling:** Tailwind CSS with shadcn/ui (New York style)
- **i18n:** i18next (English & German)
- **Icons:** Lucide React

## Project Structure

```text
/
├── public/              # Static assets (favicon, tracking logos)
├── migrations/          # SQL migration files
├── src/
│   ├── actions/         # Astro server actions
│   ├── components/      # React & Astro components
│   ├── hooks/           # Custom React hooks
│   ├── i18n/            # Translations (en, de)
│   ├── layouts/         # Page layouts
│   ├── lib/             # Utility libraries
│   ├── pages/           # File-based routing
│   ├── styles/          # Global styles
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Helper utilities
└── package.json
```

## Getting Started

```sh
# Install dependencies
npm install

# Start the dev server (http://localhost:4321)
npm run dev
```

## Commands

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`       |
| `npm run build`           | Build production site to `./dist/`               |
| `npm run preview`         | Preview the production build locally             |
| `npm run astro ...`       | Run Astro CLI commands                           |
