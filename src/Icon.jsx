export default function Icon({ name, size = 16 }) {
  const paths = {
    network: <><circle cx="4.5" cy="6" r="2" /><circle cx="15.5" cy="5" r="2" /><circle cx="10" cy="16" r="2" /><path d="m6.2 7.2 2.5 6.8M13.8 6.3l-2.5 7.4M6.5 6.3l7 0" /></>,
    refresh: <><path d="M18 8a6.6 6.6 0 0 0-11.2-2L5 8" /><path d="M5 4v4h4M6 16a6.6 6.6 0 0 0 11.2 2L19 16" /><path d="M19 20v-4h-4" /></>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" /><path d="M3 8l5-5M16 3l5 5M3 16l5 5M16 21l5-5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    database: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>,
    cloud: <path d="M17.5 18.5H7a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 12a3.3 3.3 0 0 1-1.5 6.5Z" />,
    grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
    cursor: <path d="m5 3 14 8-6.2 1.8L11 19z" />,
    pen: <><path d="m4 20 4.5-1 10.8-10.8-3.5-3.5L5 15.5 4 20Z" /><path d="m13.8 6.7 3.5 3.5M4 20h16" /></>,
    link: <><path d="M10.3 13.7a4 4 0 0 0 5.7.1l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3" /><path d="M13.7 10.3a4 4 0 0 0-5.7-.1l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="5.7" /><path d="m15 15 4.2 4.2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    layers: <><path d="m12 3 8.4 4.6L12 12.2 3.6 7.6zM3.6 12.1 12 16.7l8.4-4.6M3.6 16.6 12 21.2l8.4-4.6" /></>,
    chevronDown: <path d="m7 10 5 5 5-5" />,
    resizeHorizontal: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M3 12h18" /></>,
    resizeDiagonal: <><path d="M8 16 16 8M11 17h6v-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    download: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M5 20h14" /></>,
    upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 20h14" /></>,
    undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h8.5a5.5 5.5 0 0 1 5.5 5.5V19" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M19 12h-8.5A5.5 5.5 0 0 0 5 17.5V19" /></>,
    trash: <><path d="M4.5 7h15M9 7V4.5h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.8v5.1M12 7.8h.01" /></>,
    moon: <><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.6 8.6 0 1 0 20.4 15.2Z" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>;
}
