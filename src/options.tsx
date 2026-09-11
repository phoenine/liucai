import {
  CheckCircleIcon,
  CloudIcon,
  CpuIcon,
  DesktopTowerIcon,
  InfoIcon,
  PaletteIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { getOptionsCopy, resolveInterfaceLocale } from "./localization";
import {
  DEFAULT_LLM_SETTINGS,
  getActiveLlmConnection,
  isLlmSettingsComplete,
  loadLlmSettings,
  OPENAI_BASE_URL,
  saveLlmSettings,
  type LlmProvider,
  type LlmSettingsV1,
} from "./llmSettings";
import type { StorageResponse } from "./messages";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type InterfaceLanguage,
  type LiucaiPreferencesV1,
} from "./preferences";
import { HIGHLIGHT_ACCENT } from "./highlightTooltip";
import type { HighlightColor } from "./types";
import "./options.css";

const COLOR_OPTIONS: HighlightColor[] = ["gold", "mint", "coral"];
const LANGUAGE_OPTIONS: InterfaceLanguage[] = ["auto", "zh-CN", "en"];
const LLM_PROVIDERS: LlmProvider[] = ["lm-studio", "openai"];

type LoadState = "loading" | "ready" | "failed";
type SaveState = "idle" | "saving" | "saved" | "failed";
type SaveTarget = "preferences" | "llm" | null;
type TestState = "idle" | "testing" | "success" | "failed";

function OptionsApp() {
  const [preferences, setPreferences] = useState<LiucaiPreferencesV1>(DEFAULT_PREFERENCES);
  const [llmSettings, setLlmSettings] = useState<LlmSettingsV1>(DEFAULT_LLM_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveTarget, setSaveTarget] = useState<SaveTarget>(null);
  const [testState, setTestState] = useState<TestState>("idle");
  const saveStatusTimer = useRef<number | null>(null);

  useEffect(() => {
    void Promise.all([loadPreferences(), loadLlmSettings()])
      .then(([loadedPreferences, loadedLlmSettings]) => {
        setPreferences(loadedPreferences);
        setLlmSettings(loadedLlmSettings);
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
    setSaveTarget("preferences");
    setSaveState("saving");
    setSaveTarget("llm");
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

  async function persistLlmSettings(): Promise<void> {
    if (saveState === "saving" || !isLlmSettingsComplete(llmSettings)) return;
    setTestState("idle");
    if (saveStatusTimer.current !== null) {
      window.clearTimeout(saveStatusTimer.current);
      saveStatusTimer.current = null;
    }
    setSaveState("saving");
    try {
      setLlmSettings(await saveLlmSettings(llmSettings));
      setSaveState("saved");
      saveStatusTimer.current = window.setTimeout(() => {
        saveStatusTimer.current = null;
        setSaveState("idle");
      }, 1400);
    } catch {
      setSaveState("failed");
    }
  }

  function selectLlmProvider(provider: LlmProvider): void {
    markLlmChanged();
    setLlmSettings((current) => ({ ...current, provider }));
  }

  function markLlmChanged(): void {
    setTestState("idle");
    if (saveTarget === "llm" && saveState !== "saving") setSaveState("idle");
  }

  async function testLlmConnection(): Promise<void> {
    if (testState === "testing" || saveState === "saving") return;
    const connection = getActiveLlmConnection(llmSettings);
    if (!connection) return;
    if (saveTarget === "llm") setSaveState("idle");
    setTestState("testing");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "LIUCAI_AI_TEST_CONNECTION",
        connection,
      }) as StorageResponse<{ connected: true }> | undefined;
      if (!response?.ok) throw new Error(response?.error ?? "AI_TEST_FAILED");
      setTestState("success");
    } catch {
      setTestState("failed");
    }
  }

  const selectedLanguage = preferences.general.interfaceLanguage;
  const selectedColor = preferences.highlights.defaultAnnotationColor;
  const llmComplete = isLlmSettingsComplete(llmSettings);
  const llmBusy = loadState === "loading" || saveState === "saving" || testState === "testing";
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
                onClick={() => void (saveTarget === "llm"
                  ? persistLlmSettings()
                  : persistPreferences(preferences))}
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
                  <span
                    aria-hidden="true"
                    className="lc-options__color-swatch"
                    data-color={color}
                    style={{ "--liucai-accent": HIGHLIGHT_ACCENT[color] } as CSSProperties}
                  />
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

      <section aria-labelledby="llm-settings-title" className="lc-options__section">
        <div className="lc-options__section-heading">
          <span aria-hidden="true" className="lc-options__section-icon"><CpuIcon size={20} weight="duotone" /></span>
          <div>
            <h2 id="llm-settings-title">{copy.llm}</h2>
            <p>{copy.llmDescription}</p>
          </div>
        </div>

        <fieldset className="lc-options__color-fieldset" disabled={llmBusy}>
          <legend>{copy.llmProvider}</legend>
          <div className="lc-options__llm-provider-grid">
            {LLM_PROVIDERS.map((provider) => {
              const option = copy.llmProviders[provider];
              return (
                <label className="lc-options__llm-provider" data-selected={llmSettings.provider === provider} key={provider}>
                  <input
                    checked={llmSettings.provider === provider}
                    name="llm-provider"
                    onChange={() => selectLlmProvider(provider)}
                    type="radio"
                    value={provider}
                  />
                  <span aria-hidden="true" className="lc-options__llm-provider-icon">
                    {provider === "lm-studio"
                      ? <DesktopTowerIcon size={21} weight="regular" />
                      : <CloudIcon size={21} weight="regular" />}
                  </span>
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

        <form
          className="lc-options__llm-form"
          onSubmit={(event) => {
            event.preventDefault();
            void persistLlmSettings();
          }}
        >
          {llmSettings.provider === "lm-studio" ? (
            <>
              <label>
                <span>{copy.llmBaseUrl}</span>
                <input
                  disabled={llmBusy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    markLlmChanged();
                    setLlmSettings((current) => ({
                      ...current,
                      lmStudio: { ...current.lmStudio, baseUrl: value },
                    }));
                  }}
                  spellCheck={false}
                  type="url"
                  value={llmSettings.lmStudio.baseUrl}
                />
              </label>
              <p className="lc-options__field-help">{copy.llmStudioHelp}</p>
              <label>
                <span>{copy.llmModel}</span>
                <input
                  disabled={llmBusy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    markLlmChanged();
                    setLlmSettings((current) => ({
                      ...current,
                      lmStudio: { ...current.lmStudio, model: value },
                    }));
                  }}
                  placeholder={copy.llmModelPlaceholder}
                  spellCheck={false}
                  type="text"
                  value={llmSettings.lmStudio.model}
                />
              </label>
              <label>
                <span>{copy.llmOptionalApiKey}</span>
                <input
                  autoComplete="off"
                  disabled={llmBusy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    markLlmChanged();
                    setLlmSettings((current) => ({
                      ...current,
                      lmStudio: { ...current.lmStudio, apiKey: value },
                    }));
                  }}
                  spellCheck={false}
                  type="password"
                  value={llmSettings.lmStudio.apiKey}
                />
              </label>
            </>
          ) : (
            <>
              <p className="lc-options__llm-endpoint"><code>{OPENAI_BASE_URL}</code><span>{copy.openaiEndpoint}</span></p>
              <label>
                <span>{copy.llmModel}</span>
                <input
                  disabled={llmBusy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    markLlmChanged();
                    setLlmSettings((current) => ({
                      ...current,
                      openai: { ...current.openai, model: value },
                    }));
                  }}
                  placeholder={copy.llmModelPlaceholder}
                  spellCheck={false}
                  type="text"
                  value={llmSettings.openai.model}
                />
              </label>
              <label>
                <span>{copy.llmApiKey}</span>
                <input
                  autoComplete="off"
                  disabled={llmBusy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    markLlmChanged();
                    setLlmSettings((current) => ({
                      ...current,
                      openai: { ...current.openai, apiKey: value },
                    }));
                  }}
                  placeholder="sk-…"
                  spellCheck={false}
                  type="password"
                  value={llmSettings.openai.apiKey}
                />
              </label>
              <p className="lc-options__llm-warning" role="note">{copy.openaiDirectWarning}</p>
            </>
          )}

          <div className="lc-options__llm-actions">
            <div aria-live="polite" className="lc-options__llm-feedback">
              {!llmComplete ? <span>{copy.incompleteLlm}</span> : null}
              {llmComplete && testState === "success" ? (
                <span data-state="success"><CheckCircleIcon aria-hidden="true" size={16} weight="fill" />{copy.llmTestSuccess}</span>
              ) : null}
              {llmComplete && testState === "failed" ? <span data-state="failed">{copy.llmTestFailed}</span> : null}
              {llmComplete && saveTarget === "llm" && saveState === "saved" ? (
                <span data-state="success"><CheckCircleIcon aria-hidden="true" size={16} weight="fill" />{copy.saved}</span>
              ) : null}
            </div>
            <button
              className="lc-options__llm-button lc-options__llm-button--secondary"
              disabled={!llmComplete || llmBusy}
              onClick={() => void testLlmConnection()}
              type="button"
            >
              {testState === "testing" ? copy.testingLlm : copy.testLlm}
            </button>
            <button
              className="lc-options__llm-button lc-options__llm-button--primary"
              disabled={!llmComplete || llmBusy}
              type="submit"
            >
              {saveTarget === "llm" && saveState === "saving" ? copy.saving : copy.saveLlm}
            </button>
          </div>
        </form>
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
