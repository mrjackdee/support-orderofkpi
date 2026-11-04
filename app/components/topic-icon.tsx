export default function TopicIcon({ code }: { code: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (code === "COM") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (code === "ACC") return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M7 15h3" /></svg>;
  if (code === "BUG") return <svg {...common}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4M9 5h6" /></svg>;
  if (code === "ENH") return <svg {...common}><path d="M9 18h6M10 22h4M8.4 14.8A7 7 0 1 1 15.6 14.8C14.6 15.5 14 16.3 14 17h-4c0-.7-.6-1.5-1.6-2.2Z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5h.01" /></svg>;
}
