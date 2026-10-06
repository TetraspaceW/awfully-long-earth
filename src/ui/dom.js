// DOM helpers.

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const tick = () => new Promise((r) => setTimeout(r, 0));
export const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;
