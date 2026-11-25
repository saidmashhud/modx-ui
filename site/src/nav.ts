/** The site map: guide pages, then components by group. A tag missing here still gets a page (under "More"). */
export interface NavLink { page: string; title: string; href: string }
export interface NavGroup { title: string; links: NavLink[] }

const tag = (t: string): NavLink => ({ page: t, title: t, href: `${t}.html` });

export const GUIDE: NavGroup = {
  title: 'Guide',
  links: [
    { page: 'index', title: 'Overview', href: 'index.html' },
    { page: 'start', title: 'Getting started', href: 'start.html' },
    { page: 'theming', title: 'Theming', href: 'theming.html' },
    { page: 'i18n', title: 'i18n and RTL', href: 'i18n.html' },
    { page: 'forms', title: 'Forms', href: 'forms.html' },
    { page: 'store', title: 'Store and SyncEngine', href: 'store.html' },
  ],
};

export const COMPONENT_GROUPS: { title: string; tags: string[] }[] = [
  { title: 'Actions', tags: ['mx-button', 'mx-icon', 'mx-kbd'] },
  { title: 'Fields', tags: ['mx-input', 'mx-textarea', 'mx-select', 'mx-date-picker', 'mx-switch', 'mx-segmented'] },
  { title: 'Overlays', tags: ['mx-dialog', 'mx-popover', 'mx-command-list', 'mx-tooltip', 'mx-toast-region'] },
  { title: 'Navigation', tags: ['mx-nav-item', 'mx-breadcrumbs'] },
  { title: 'Display', tags: ['mx-avatar', 'mx-chip', 'mx-stat', 'mx-empty', 'mx-spinner', 'mx-status-icon', 'mx-priority-icon', 'mx-illustration', 'mx-markdown'] },
];

export function navGroups(allTags: string[]): NavGroup[] {
  const known = new Set(COMPONENT_GROUPS.flatMap((g) => g.tags));
  const groups: NavGroup[] = [GUIDE, ...COMPONENT_GROUPS.map((g) => ({ title: g.title, links: g.tags.filter((t) => allTags.includes(t)).map(tag) }))];
  const more = allTags.filter((t) => !known.has(t));
  if (more.length) groups.push({ title: 'More', links: more.map(tag) });
  return groups;
}

/** Previous and next page in reading order. */
export function neighbours(groups: NavGroup[], page: string): { prev?: NavLink; next?: NavLink } {
  const flat = groups.flatMap((g) => g.links);
  const i = flat.findIndex((l) => l.page === page);
  return i < 0 ? {} : { prev: flat[i - 1], next: flat[i + 1] };
}
