export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <span className="loading-dot" />
      <p>Getting your workspace ready…</p>
    </main>
  );
}
