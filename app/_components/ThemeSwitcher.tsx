"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY, THEMES, type Theme } from "../_lib/theme";

const LABELS: Record<Theme, string> = { dark: "Dark", light: "Light" };

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** Dark (default) or Light. Saved in this browser and applied before paint on the next load. */
export function ThemeSwitcher() {
  // The server cannot know the saved choice, so nothing is checked until hydration.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page only.
    }
  }

  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">Theme</legend>
      {THEMES.map((option) => (
        <label key={option} className={theme === option ? "segment active" : "segment"}>
          <input
            type="radio"
            name="theme"
            value={option}
            checked={theme === option}
            onChange={() => choose(option)}
          />
          {LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}
