# Hexsmith

Hexsmith is an AI-powered web IDE where you describe what you want to build and the assistant writes, edits, and organizes the code for you. Projects run live in the browser via WebContainers — no server-side execution required.

## Features

- **AI coding assistant** — Describe a feature or app in plain language. The assistant scaffolds files, writes code, and iterates based on follow-up messages. Each conversation maintains context across messages.
- **Full code editor** — CodeMirror 6 editor with syntax highlighting for JavaScript, TypeScript, HTML, CSS, Python, Markdown, and more. Files auto-save to the database with a short debounce.
- **Live preview** — The Preview tab boots a WebContainer in the browser, runs `npm install` and your dev server, and renders the output in an iframe. File changes sync automatically without restarting the container.
- **File explorer** — Create, rename, delete, and navigate files and folders within a project.
- **GitHub integration** — Import any public or private GitHub repository as a project. Export a project back to GitHub as a new repository (Pro plan required).
- **Conversation history** — Each project supports multiple conversations. The assistant auto-generates a short title for each one.
- **Usage tiers** — Free accounts get 10 AI messages per month. Pro accounts have unlimited messages and GitHub export access.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Database | Convex (real-time, reactive) |
| Auth | Clerk |
| Background jobs | Inngest |
| AI | Anthropic SDK (`claude-*` models) |
| Browser runtime | WebContainer API |
| Editor | CodeMirror 6 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Error tracking | Sentry |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev) account and project
- A [Clerk](https://clerk.com) application with GitHub OAuth enabled
- An [Inngest](https://inngest.com) account (or use the local dev server)
- An [Anthropic](https://anthropic.com) API key
- A [Firecrawl](https://firecrawl.dev) API key (used by the URL scraping tool)

### Environment Variables

Create a `.env.local` file at the project root:

```env
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
HEXSMITH_CONVEX_INTERNAL_KEY=   # Secret used by API routes to call privileged Convex mutations

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Firecrawl
FIRECRAWL_API_KEY=

# Inngest (leave blank to use local dev server)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Sentry (optional)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

### Running Locally

Start the Convex and Next.js dev servers in separate terminals:

```bash
npx convex dev
```

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

To inspect Inngest background jobs locally, run the Inngest dev server and point it at `http://localhost:3000/api/inngest`:

```bash
npx inngest-cli@latest dev
```

## How It Works

### AI Agent

When a user sends a message, the Next.js API route (`/api/messages`) authenticates the request, writes both the user message and an empty assistant placeholder to Convex, then fires a `message/sent` event to Inngest. The Inngest function `processMessage` runs the Anthropic agent loop — fetching conversation history, calling tools, and streaming content back to the Convex message document in real time.

The agent has access to these file-system tools: `list_files`, `read_files`, `update_file`, `create_files`, `create_folder`, `rename_file`, `delete_files`, and `scrape_urls`. All tool calls operate on the Convex file store for the current project.

New projects scaffold with Vite by default (React + Vite for web apps). The agent is instructed to always produce a working `package.json` with a `dev` script so the live preview can boot immediately.

### Live Preview

The Preview tab uses the [WebContainer API](https://webcontainers.io) to run Node.js entirely in the browser. When the tab is first activated, it mounts the project's file tree, runs the configured install command (default: `npm install`), and then the dev command (default: `npm run dev`). Once the container's server is ready, the URL is loaded into an iframe. Subsequent file edits sync into the container's virtual filesystem without restarting.

### GitHub Integration

**Import:** Provide a GitHub repository URL. An Inngest job clones the repo contents via the GitHub API and writes each file into Convex.

**Export (Pro):** Provide a repository name and visibility. An Inngest job reads all project files from Convex and pushes them to a new GitHub repository using the user's OAuth token (stored by Clerk).

## Project Structure

```
convex/          # Database schema, queries, and mutations
src/
  app/           # Next.js App Router pages and API routes
  features/
    conversations/  # Chat UI + Inngest AI agent + file-system tools
    editor/         # CodeMirror editor, tab management
    preview/        # WebContainer hook, terminal output, settings
    projects/       # File explorer, project list, GitHub dialogs
    auth/           # Auth-gated UI components
  components/    # Shared UI (providers, shadcn/ui wrappers)
  inngest/       # Inngest client
  lib/           # Convex client, Firecrawl client, utilities
```
