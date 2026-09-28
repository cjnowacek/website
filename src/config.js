// src/config.js — ported from includes/config.php
export const siteName = 'CJ Nowacek';
export const siteTitle = 'CJ Nowacek';

// Navigation: [href, label]
// No Home item: the site title in the header links home, and seven items
// wrapped to two rows on a tablet.
export const navItems = [
  ['/techart', 'Tech Art'],
  ['/devops', 'Pipeline'],
  ['/devlog', 'Dev Log'],
  ['/other', 'Other'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
];

export const siteDescription =
  'CJ Nowacek: Pipeline Developer and Technical Artist specializing in CG production tooling, render farm automation, character rigging, and DCC workflows.';

export const socialLinks = {
  linkedin: 'https://linkedin.com/in/cj-nowacek',
  github: 'https://github.com/cjnowacek',
  vimeo: 'https://vimeo.com/1016947852',
  email: 'mailto:cj@cjnowacek.com',
};
