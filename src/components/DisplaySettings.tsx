import { useEffect, useId, useRef, useState } from "react";
import {
  applyDisplayPreferences,
  DISPLAY_PREFERENCES_EVENT,
  getDisplayPreferencesNotice,
  loadDisplayPreferences,
  saveDisplayPreferences,
} from "../lib/preferences";
import type { DisplayPreferences } from "../lib/preferences";

export default function DisplaySettings() {
  const id = useId();
  const [state, setState] = useState(() => {
    const preferences = loadDisplayPreferences();
    const message = getDisplayPreferencesNotice();
    return { preferences, message, warning: !!message };
  });
  const initialPreferences = useRef(state.preferences);

  useEffect(() => {
    // Also works when this component is mounted without the application's initializer.
    applyDisplayPreferences(initialPreferences.current);
    function onPreferencesChange(event: Event) {
      const preferences = (event as CustomEvent<DisplayPreferences>).detail;
      const message = getDisplayPreferencesNotice();
      setState({ preferences, message, warning: !!message });
    }
    window.addEventListener(DISPLAY_PREFERENCES_EVENT, onPreferencesChange);
    return () => window.removeEventListener(DISPLAY_PREFERENCES_EVENT, onPreferencesChange);
  }, []);

  function update(preferences: DisplayPreferences) {
    const saved = saveDisplayPreferences(preferences);
    applyDisplayPreferences(preferences);
    setState({
      preferences,
      message: saved ? "Display preferences saved in this browser." : getDisplayPreferencesNotice(),
      warning: !saved,
    });
  }

  return (
    <section className="display-settings card" aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`}>Display preferences</h1>
      <p className="muted">
        Choose a comfortable appearance and reading size. Changes apply immediately.
      </p>

      <div className="display-settings-field">
        <label htmlFor={`${id}-theme`}>Theme</label>
        <select
          id={`${id}-theme`}
          value={state.preferences.theme}
          aria-describedby={`${id}-theme-help`}
          onChange={(event) => update({
            ...state.preferences,
            theme: event.target.value as DisplayPreferences["theme"],
          })}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <p id={`${id}-theme-help`} className="muted">
          System follows your device’s light or dark appearance.
        </p>
      </div>

      <div className="display-settings-field">
        <label htmlFor={`${id}-text-size`}>Reading text size</label>
        <select
          id={`${id}-text-size`}
          value={state.preferences.textSize}
          aria-describedby={`${id}-text-help`}
          onChange={(event) => update({
            ...state.preferences,
            textSize: event.target.value as DisplayPreferences["textSize"],
          })}
        >
          <option value="standard">Standard</option>
          <option value="large">Large</option>
          <option value="larger">Larger</option>
        </select>
        <p id={`${id}-text-help`} className="muted">
          Enlarges reading text, questions, answer choices, feedback, and code lab fields.
          You can still use your browser’s zoom controls.
        </p>
      </div>

      <p className="display-settings-privacy muted">
        These preferences are stored only in this browser on this device, not in an account.
        They do not sync to other devices. Clearing browser data removes them. Your course
        progress is not changed.
      </p>
      <p
        className={`display-settings-status${state.warning ? " is-warning" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state.message}
      </p>
    </section>
  );
}
