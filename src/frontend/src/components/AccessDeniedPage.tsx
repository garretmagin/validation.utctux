/**
 * Shown when the user is authenticated but lacks the required role.
 */
export default function AccessDeniedPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100vh",
        padding: 32,
        textAlign: "center",
        gap: 16,
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ margin: 0 }}>Access Denied</h1>
      <p style={{ maxWidth: 480, lineHeight: 1.5 }}>
        You don't have the required role to use this application. Request access
        by joining the entitlement group below.
      </p>
      <a
        href="https://coreidentity.microsoft.com/manage/Entitlement/entitlement/tmtestschedu-0wu3"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          backgroundColor: "var(--communication-background, #0078d4)",
          color: "#fff",
          borderRadius: 4,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Request Access
      </a>
    </div>
  );
}
