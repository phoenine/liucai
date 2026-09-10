import {
  CheckCircleIcon,
  InfoIcon,
  PaletteIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getOptionsCopy, resolveInterfaceLocale } from "./localization";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type InterfaceLanguage,
  type LiucaiPreferencesV1,
} from "./preferences";
import type { HighlightColor } from "./types";
import "./options.css";

const COLOR_OPTIONS: HighlightColor[] = ["gold", "mint", "coral"];
const LANGUAGE_OPTIONS: InterfaceLanguage[] = ["auto", "zh-CN", "en"];

type LoadState = "loading" | "ready" | "failed";
type SaveState = "idle" | "saving" | "saved" | "failed";

function OptionsApp() {
  const [preferences, setPreferences] = useState<LiucaiPreferencesV1>(DEFAULT_PREFERENCES);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveStatusTimer = useRef<number | null>(null);

  useEffect(() => {
    void loadPreferences()
      .then((loaded) => {
        setPreferences(loaded);
        setLoadState("ready");
      })
      .catch(() => setLoadState("failed"));
  }, []);

  useEffect(() => () => {
    if (saveStatusTimer.current !== null) {
      window.clearTimeout(saveStatusTimer.current);
    }
  }, []);

  async function persistPreferences(next: LiucaiPreferencesV1): Promise<void> {
    if (saveState === "saving") return;
    if (saveStatusTimer.current !== null) {
      window.clearTimeout(saveStatusTimer.current);
      saveStatusTimer.current = null;
    }
    setPreferences(next);
    setSaveState("saving");
    try {
      setPreferences(await savePreferences(next));
      setSaveState("saved");
      saveStatusTimer.current = window.setTimeout(() => {
        saveStatusTimer.current = null;
        setSaveState("idle");
      }, 1400);
    } catch {
      setSaveState("failed");
    }
  }

  function selectInterfaceLanguage(interfaceLanguage: InterfaceLanguage): void {
    if (interfaceLanguage === preferences.general.interfaceLanguage) return;
    void persistPreferences({
      ...preferences,
      general: { interfaceLanguage },
    });
  }

  function selectDefaultColor(defaultAnnotationColor: HighlightColor): void {
    if (defaultAnnotationColor === preferences.highlights.defaultAnnotationColor) return;
    void persistPreferences({
      ...preferences,
      highlights: { defaultAnnotationColor },
    });
  }

  const selectedLanguage = preferences.general.interfaceLanguage;
  const selectedColor = preferences.highlights.defaultAnnotationColor;
  const locale = resolveInterfaceLocale(selectedLanguage);
  const copy = getOptionsCopy(locale);
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().version
    : "1.0.0";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.pageTitle;
  }, [copy.pageTitle, locale]);

  return (
    <main className="lc-options">
      <header className="lc-options__header">
        <div className="lc-options__brand">
          <div aria-hidden="true" className="lc-options__logo">六</div>
          <div>
            <p className="lc-options__eyebrow">六彩 Liucai</p>
            <h1>{copy.settings}</h1>
            <p className="lc-options__intro">{copy.intro}</p>
          </div>
        </div>
        <div aria-live="polite" className="lc-options__save-status" data-state={saveState}>
          {saveState === "saving" ? copy.saving : null}
          {saveState === "saved" ? <><CheckCircleIcon aria-hidden="true" size={17} weight="fill" />{copy.saved}</> : null}
          {saveState === "failed" ? (
            <>
              {copy.saveFailed}
              <button
                className="lc-options__retry"
                onClick={() => void persistPreferences(preferences)}
                type="button"
              >
                {copy.retry}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {loadState === "failed" ? (
        <div className="lc-options__notice" role="alert">
          {copy.loadFailed}
        </div>
      ) : null}

      <section aria-labelledby="language-settings-title" className="lc-options__section">
        <div className="lc-options__section-heading">
          <span aria-hidden="true" className="lc-options__section-icon"><TranslateIcon size={20} weight="duotone" /></span>
          <div>
            <h2 id="language-settings-title">{copy.languageSection}</h2>
            <p>{copy.languageSectionDescription}</p>
          </div>
        </div>

        <fieldset className="lc-options__color-fieldset" disabled={loadState === "loading" || saveState === "saving"}>
          <legend>{copy.interfaceLanguage}</legend>
          <p className="lc-options__field-help">{copy.languageHelp}</p>
          <div className="lc-options__language-grid">
            {LANGUAGE_OPTIONS.map((language) => {
              const option = copy.languages[language];
              return (
                <label className="lc-options__language-option" data-selected={selectedLanguage === language} key={language}>
                  <input
                    checked={selectedLanguage === language}
                    name="interface-language"
                    onChange={() => selectInterfaceLanguage(language)}
                    type="radio"
                    value={language}
                  />
                  <span className="lc-options__language-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <CheckCircleIcon aria-hidden="true" className="lc-options__color-check" size={21} weight="fill" />
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="highlight-settings-title" className="lc-options__section">
        <div className="lc-options__section-heading">
          <span aria-hidden="true" className="lc-options__section-icon"><PaletteIcon size={20} weight="duotone" /></span>
          <div>
            <h2 id="highlight-settings-title">{copy.highlights}</h2>
            <p>{copy.highlightsDescription}</p>
          </div>
        </div>

        <fieldset className="lc-options__color-fieldset" disabled={loadState === "loading" || saveState === "saving"}>
          <legend>{copy.defaultColor}</legend>
          <p className="lc-options__field-help">{copy.defaultColorHelp}</p>
          <div className="lc-options__color-grid">
            {COLOR_OPTIONS.map((color) => {
              const option = copy.colors[color];
              return (
                <label className="lc-options__color-option" data-selected={selectedColor === color} key={color}>
                  <input
                    checked={selectedColor === color}
                    name="default-highlight-color"
                    onChange={() => selectDefaultColor(color)}
                    type="radio"
                    value={color}
                  />
                  <span aria-hidden="true" className="lc-options__color-swatch" data-color={color} />
                  <span className="lc-options__color-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <CheckCircleIcon aria-hidden="true" className="lc-options__color-check" size={21} weight="fill" />
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="privacy-title" className="lc-options__section lc-options__section--compact">
        <div className="lc-options__section-heading">
          <span aria-hidden="true" className="lc-options__section-icon"><InfoIcon size={20} weight="duotone" /></span>
          <div>
            <h2 id="privacy-title">{copy.privacy}</h2>
            <p>{copy.privacyDescription}</p>
          </div>
        </div>
      </section>

      <footer className="lc-options__footer">
        <span>六彩 Liucai</span>
        <span>{copy.version} {version}</span>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<OptionsApp />);
}
