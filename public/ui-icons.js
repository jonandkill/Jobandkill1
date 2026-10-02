const shapes = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  school: '<path d="m3 9 9-6 9 6M5 9v11h14V9M9 20v-6h6v6M9 9h6M3 20h18"/>',
  chart: '<path d="M4 4v16h17M8 16v-4m5 4V8m5 8V5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  pencil: '<path d="m15 4 5 5M4 20l1-5L16 4a2 2 0 0 1 3 3L8 18l-4 2Z"/>',
  speech: '<path d="M20 11a7 7 0 0 1-7 7H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v4Z"/><path d="M7 8h9M7 12h6"/>',
  paper: '<path d="M6 3h9l4 4v14H6V3ZM15 3v5h4M9 12h7M9 16h5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export const icon = name => `<svg class="admission-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.arrow}</svg>`;
