/** Theme choice: dark by default, with a light variant. Stored in the browser only. */

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "vault-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint (inlined in <head>) so a saved light theme never
 * flashes dark. It sets the same `data-theme` attribute the Settings page writes.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(
  THEMES,
)}.indexOf(t)>=0)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
