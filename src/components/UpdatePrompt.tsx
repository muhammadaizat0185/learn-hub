import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const HIDE_OFFLINE_READY_MS = 6_000;

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), HIDE_OFFLINE_READY_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  function dismiss() {
    setNeedRefresh(false);
    setOfflineReady(false);
  }

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <p>
        {needRefresh
          ? "A new version is ready. Update to get the latest course data."
          : "Ready offline — keep practising without a connection."}
      </p>
      <div className="pwa-toast-actions">
        {needRefresh && (
          <button className="btn primary tiny" onClick={() => void updateServiceWorker(true)}>
            Update now
          </button>
        )}
        <button className="btn ghost tiny" onClick={dismiss}>
          {needRefresh ? "Later" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
