<script setup>
/**
 * App header.
 *
 * Replaces a row of bare links that also had a markup bug: each RouterLink
 * wrapped a BNavItem, so the DOM was `<a><li><a class="nav-link">` - nested
 * anchors, which is invalid HTML and meant the active-link styles in the old
 * stylesheet never matched anything. This is a plain semantic <nav> with
 * RouterLinks styled directly, so `router-link-active` actually works.
 *
 * The mark is three ascending bars in three steps of the same blue ramp the
 * charts use (palette.js SEQUENTIAL 500 / 400 / 250), so the header and the
 * dashboard read as one product rather than two.
 */
const links = [
  {
    to: '/',
    label: 'Dashboard',
    // Bars on a baseline.
    icon: 'M2.5 13.5h11M4.5 10.5v3M8 6.5v7M11.5 3.5v10',
  },
  {
    to: '/transactions',
    label: 'Transactions',
    icon: 'M3 4.5h10M3 8h10M3 11.5h6',
  },
  {
    to: '/categories',
    label: 'Categories',
    icon: 'M13.2 8.9l-4.3 4.3a1.2 1.2 0 01-1.7 0L2.8 8.8a1.2 1.2 0 01-.35-.85V3.7c0-.66.54-1.2 1.2-1.2H8c.32 0 .62.13.85.35l4.35 4.35a1.2 1.2 0 010 1.7z',
    dot: [5.2, 5.2],
  },
  {
    to: '/import',
    label: 'Import',
    icon: 'M8 3v7M5.2 5.8L8 3l2.8 2.8M3 11.2v1.5c0 .72.58 1.3 1.3 1.3h7.4c.72 0 1.3-.58 1.3-1.3v-1.5',
  },
]
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" aria-label="Finance Viewer — dashboard">
        <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="13" width="4.5" height="8" rx="1.5" fill="#256abf" />
          <rect x="9.75" y="8" width="4.5" height="13" rx="1.5" fill="#3987e5" />
          <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" fill="#86b6ef" />
        </svg>
        <span class="brand-text">
          <span class="brand-strong">Finance</span><span class="brand-soft">Viewer</span>
        </span>
      </RouterLink>

      <nav class="nav" aria-label="Main">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="link.icon" />
            <circle v-if="link.dot" :cx="link.dot[0]" :cy="link.dot[1]" r="0.9" fill="currentColor" stroke="none" />
          </svg>
          <span class="nav-label">{{ link.label }}</span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  height: var(--app-header-h);
  background: rgba(26, 29, 33, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0 1rem;
}

/* ---------- brand ---------- */
.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  flex-shrink: 0;
  padding: 0.25rem 0;
}

.brand:hover {
  background: none;
}

.brand-mark {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 0.28rem;
  font-size: 1.0625rem;
  letter-spacing: -0.01em;
  line-height: 1;
}

.brand-strong {
  font-weight: 650;
  color: #ffffff;
}

.brand-soft {
  font-weight: 400;
  color: #898781;
}

/* ---------- nav ---------- */
.nav {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: auto;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.45rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #898781;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.nav-link:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
}

/* Vue Router marks the matching link; the old stylesheet targeted a selector
   that could never match because of the nested-anchor markup. */
.nav-link.router-link-active {
  color: #ffffff;
  background: rgba(57, 135, 229, 0.16);
  box-shadow: inset 0 0 0 1px rgba(57, 135, 229, 0.35);
}

.nav-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.9;
}

/* Icon-only below the point where four labels stop fitting beside the brand. */
@media (max-width: 620px) {
  .header-inner {
    gap: 0.75rem;
    padding: 0 0.6rem;
  }

  .nav-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .nav-link {
    padding: 0.45rem 0.55rem;
  }

  .brand-soft {
    display: none;
  }
}
</style>
