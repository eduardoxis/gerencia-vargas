// js/utils/icons.js
// Ícones SVG (stroke, estilo Feather) usados no Painel Administrativo.
// Todos herdam a cor via currentColor — nada de emojis.

export const ICONS = {
  upload: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4h10a1 1 0 0 1 1 1v2.2a1 1 0 0 1-1 1H9.8V11H16a1 1 0 0 1 1 1v2.2a1 1 0 0 1-1 1H9.8V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,

  home: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 11.5 12 4l8 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  box: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 7.5 12 3l8.5 4.5V16.5L12 21l-8.5-4.5V7.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3.8 7.3 12 12l8.2-4.7M12 12v9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,

  tag: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>`,

  bookmark: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,

  archive: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="4" width="17" height="4.5" rx="1" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 8.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.5" stroke="currentColor" stroke-width="1.8"/><path d="M10 12.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  users: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 20c.6-3.3 3-5 5.5-5s4.9 1.7 5.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 5.3a3.2 3.2 0 0 1 0 6.2M18 20c-.4-2.3-1.5-3.9-3.2-4.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  userPlus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 20c.6-3.3 3-5 5.5-5s4.9 1.7 5.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 8v6M21.5 11h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  trendingUp: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 16.5 10 10l4 4 6.5-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 7.5h5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  chevronRight: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  dollarSign: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 6.5v11M15 9.2c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 2 3 2 3 .8 3 2-1.3 2-3 2-3-.8-3-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,

  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  search: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  sort: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4v16M7 4 3.5 7.5M7 4l3.5 3.5M17 20V4m0 16 3.5-3.5M17 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  plus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,

  pencil: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20l.9-3.9L16.4 4.6a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L8 19.1 4 20Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14.5 6.5 3 3" stroke="currentColor" stroke-width="1.7"/></svg>`,

  copy: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" stroke="currentColor" stroke-width="1.7"/></svg>`,

  trash: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 7h15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.8"/><path d="M7 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4L17 7" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 10.5v6M14 10.5v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  inboxEmpty: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 27 20 12h24l8 15" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity="0.5"/><path d="M10 27h12l3 6h14l3-6h12v22a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V27Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M22 8 20 5M42 8l2-3M32 6V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/></svg>`,

  gridEmpty: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="44" height="44" rx="6" stroke="currentColor" stroke-width="2" opacity="0.5"/><path d="M22 26h8M22 34h20M22 42h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,

  eye: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>`,

  eyeOff: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.6 5.6A10.7 10.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.2 4M6.7 6.9C4.1 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.4-.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  user: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  cart: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 4h2l1.6 10.2a2 2 0 0 0 2 1.7h8.1a2 2 0 0 0 2-1.6l1.3-6.8H6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="17.5" cy="20" r="1.4" fill="currentColor"/></svg>`,

  menu: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  grid: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>`,

  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.14 0 4.14.83 5.65 2.34a7.93 7.93 0 0 1 2.33 5.9c0 4.51-3.67 8.19-8.18 8.19a8.2 8.2 0 0 1-4.16-1.13l-.3-.17-3.12.82.83-3.04-.19-.31a8.15 8.15 0 0 1-1.25-4.35c0-4.51 3.67-8.25 8.19-8.25Zm-4.52 4.62c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02 0 1.19.87 2.34.99 2.5.12.16 1.71 2.73 4.24 3.72 2.1.83 2.53.66 2.99.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.11-.22-.17-.46-.29-.24-.12-1.48-.73-1.71-.81-.23-.08-.4-.12-.57.12-.17.24-.65.81-.8.98-.15.17-.29.19-.53.06-.24-.12-1.03-.38-1.96-1.21a7.36 7.36 0 0 1-1.36-1.68c-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43-.15-.01-.32-.01-.48-.01Z"/></svg>`,

  truck: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h10v9H3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13 10h4l3 3v2h-7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.6" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="17.5" r="1.6" stroke="currentColor" stroke-width="1.6"/></svg>`,

  creditCard: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10.5h18" stroke="currentColor" stroke-width="1.7"/><path d="M6.5 14.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  shieldCheck: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5 19 6v6c0 4.5-3 7.2-7 8.5-4-1.3-7-4-7-8.5V6l7-2.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2 2 4-4.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  headset: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="3" y="13" width="4" height="6" rx="1.4" stroke="currentColor" stroke-width="1.7"/><rect x="17" y="13" width="4" height="6" rx="1.4" stroke="currentColor" stroke-width="1.7"/><path d="M19 19.5v.5a3 3 0 0 1-3 3h-2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  mail: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5.5" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,

  instagram: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>`,

  facebook: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 21v-7.2h2.4l.4-2.8h-2.8V9.2c0-.8.2-1.4 1.4-1.4h1.5V5.3c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.1H9.3v2.8h2.4V21h2.8Z" fill="currentColor"/></svg>`,

  star: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="m12 3 2.7 5.9 6.3.7-4.7 4.4 1.3 6.3L12 17.2 6.4 20.3l1.3-6.3-4.7-4.4 6.3-.7L12 3Z"/></svg>`,

  backpack: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" stroke-width="1.7"/><path d="M6.5 8h11a2 2 0 0 1 2 2v8a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4.5 18v-8a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 12.5h5M9.5 20.5v-4h5v4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,

  laptop: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4.5" y="5" width="15" height="10" rx="1.3" stroke="currentColor" stroke-width="1.7"/><path d="M2.5 19h19l-1.6-3H4.1L2.5 19Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,

  palette: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5a8.5 8 0 1 0 0 16c1.4 0 2-1 1.1-2-.6-.7-.2-1.8.8-1.8H16a4 4 0 0 0 4-4c0-4.5-3.6-8.2-8-8.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8" cy="10.5" r="1.1" fill="currentColor"/><circle cx="11.5" cy="7.7" r="1.1" fill="currentColor"/><circle cx="15.3" cy="9.3" r="1.1" fill="currentColor"/><circle cx="9" cy="14.5" r="1.1" fill="currentColor"/></svg>`,

  printer: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 8.5V4h11v4.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="3.5" y="8.5" width="17" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="6.5" y="13" width="11" height="7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="17" cy="11.3" r="0.9" fill="currentColor"/></svg>`,

  notebook: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="3.5" width="14" height="17" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M9 3.5v17" stroke="currentColor" stroke-width="1.7"/><path d="M12.5 8h3M12.5 11.5h3M12.5 15h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  pen: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 15.5 15.5 6l2.5 2.5L8.5 18H6v-2.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.5 8 16 10.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 21h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  gift: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="9.5" width="17" height="4" rx="1" stroke="currentColor" stroke-width="1.7"/><path d="M5 13.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5V21" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5c-2.5 0-4.5-1-4.5-3S9 3.5 10 4.5s2 3 2 5Zm0 0c2.5 0 4.5-1 4.5-3S15 3.5 14 4.5s-2 3-2 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7.5" width="18" height="12" rx="1.8" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" stroke="currentColor" stroke-width="1.7"/><path d="M3 12.5h18M10.5 12v1.5M13.5 12v1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  phone: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="2.5" width="10" height="19" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M11 18.5h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  clipboardList: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="4.5" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="3" width="6" height="3" rx="1" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  messageSquare: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,

  shoppingBag: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 8h11l1 12.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5.5 20.5L6.5 8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.7"/></svg>`,

  mapPin: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.5s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.4" stroke="currentColor" stroke-width="1.7"/></svg>`,

  heart: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20.2s-7.8-4.6-9.6-10A5 5 0 0 1 12 6.3a5 5 0 0 1 9.6 3.9c-1.8 5.4-9.6 10-9.6 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,

  settings: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13.5c.1-.5.1-1 0-1.5l1.7-1.3-1.5-2.6-2 .6a7 7 0 0 0-1.3-.8l-.3-2.1H10l-.3 2.1c-.5.2-.9.5-1.3.8l-2-.6-1.5 2.6 1.7 1.3c-.1.5-.1 1 0 1.5l-1.7 1.3 1.5 2.6 2-.6c.4.3.8.6 1.3.8l.3 2.1h3.9l.3-2.1c.5-.2.9-.5 1.3-.8l2 .6 1.5-2.6-1.7-1.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,

  logOut: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16 16.5 20.5 12 16 7.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 12H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  bell: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.3 5.5 1.8 6.2.3.4 0 .8-.5.8H4.7c-.5 0-.8-.4-.5-.8C4.7 15.5 6 14 6 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,

  calendar: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  lock: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  download: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5v12M7.5 11l4.5 4.5L16.5 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 16.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  refresh: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 11.5a8 8 0 0 0-14.6-4.6M4 5v4.5h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12.5a8 8 0 0 0 14.6 4.6M20 19v-4.5h-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  minus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,

  filter: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h16L14 13v6l-4 2v-8L4 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
};

/** Retorna um <span> com o ícone pronto para inserir no innerHTML. */
export function icon(name, cls = "") {
  return `<span class="icon${cls ? " " + cls : ""}" aria-hidden="true">${ICONS[name] || ""}</span>`;
}
