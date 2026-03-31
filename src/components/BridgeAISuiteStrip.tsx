const BridgeIcon = () => (
  <svg width="20" height="16" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 14h16" stroke="#5DCAA5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 14V9" stroke="#5DCAA5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 14V9" stroke="#5DCAA5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 10C3 5.58 6.58 2 10 2s7 3.58 7 8" stroke="#9FE1CB" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

interface NavItem {
  label: string;
  href: string | null;
  active: boolean;
}

const links: NavItem[] = [
  { label: "ElBridgeAI", href: null, active: true },
  { label: "ParentsBridgeAI", href: "https://parentsbridgeai.com", active: false },
  { label: "SpellingBridgeAI", href: "https://spellingbridgeai.com", active: false },
];

const BridgeAISuiteStrip = () => (
  <div
    className="w-full flex items-center"
    style={{
      backgroundColor: "#04342C",
      height: 40,
      fontSize: 13,
    }}
  >
    <div className="container mx-auto px-4 flex items-center gap-0">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <BridgeIcon />
        <span className="font-medium" style={{ color: "#9FE1CB" }}>
          BridgeAI Suite
        </span>
      </div>

      {/* Divider */}
      <div
        className="mx-3 self-stretch"
        style={{
          width: 1,
          backgroundColor: "rgba(255,255,255,0.15)",
          marginTop: 8,
          marginBottom: 8,
        }}
      />

      {/* Links */}
      <nav className="flex items-center gap-0.5">
        {links.map((link) => {
          const style: React.CSSProperties = {
            color: link.active ? "#9FE1CB" : "rgba(255,255,255,0.6)",
            fontWeight: link.active ? 500 : 400,
            padding: "10px 14px",
            borderRadius: 4,
            lineHeight: 1,
            textDecoration: "none",
            transition: "background 0.15s, color 0.15s",
          };

          if (link.active) {
            return (
              <span key={link.label} style={style}>
                {link.label}
              </span>
            );
          }

          return (
            <a
              key={link.label}
              href={link.href!}
              target="_blank"
              rel="noopener noreferrer"
              style={style}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
    </div>
  </div>
);

export default BridgeAISuiteStrip;
