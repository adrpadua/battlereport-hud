import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useSettingsStore } from '@/store/settings-store';

function Popup(): React.ReactElement {
  const { apiKey, hudPosition, autoExtract, setApiKey, setHudPosition, setAutoExtract, loadSettings } =
    useSettingsStore();

  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (apiKey) {
      setInputKey(apiKey);
    }
  }, [apiKey]);

  const handleSaveKey = () => {
    setApiKey(inputKey || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearKey = () => {
    setInputKey('');
    setApiKey(null);
  };

  const maskedKey = inputKey
    ? `${inputKey.slice(0, 7)}...${inputKey.slice(-4)}`
    : '';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ fontSize: 20 }}>⚔️</span>
        <div>
          <h1 style={styles.title}>Battle Report HUD</h1>
          <p style={styles.subtitle}>Warhammer 40k Army List Extractor</p>
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>OpenAI API Key</label>
        <div style={styles.inputGroup}>
          <input
            type={showKey ? 'text' : 'password'}
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="sk-..."
            style={styles.input}
          />
          <button
            style={styles.iconButton}
            onClick={() => setShowKey(!showKey)}
            title={showKey ? 'Hide' : 'Show'}
          >
            {showKey ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        {apiKey && (
          <p style={styles.hint}>Current: {maskedKey}</p>
        )}
        <div style={styles.buttonGroup}>
          <button style={styles.button} onClick={handleSaveKey}>
            {saved ? '✓ Saved!' : 'Save Key'}
          </button>
          {apiKey && (
            <button
              style={{ ...styles.button, ...styles.dangerButton }}
              onClick={handleClearKey}
            >
              Clear
            </button>
          )}
        </div>
        <p style={styles.hint}>
          Get your API key from{' '}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            OpenAI Dashboard
          </a>
        </p>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>HUD Position</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="position"
              checked={hudPosition === 'right'}
              onChange={() => setHudPosition('right')}
            />
            Right Sidebar
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="position"
              checked={hudPosition === 'left'}
              onChange={() => setHudPosition('left')}
            />
            Left Sidebar
          </label>
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={autoExtract}
            onChange={(e) => setAutoExtract(e.target.checked)}
          />
          Auto-extract on page load
        </label>
      </div>

      <div style={styles.footer}>
        <p style={styles.footerText}>
          Visit a YouTube battle report video to see the HUD in action.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #3a3a3a',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    margin: 0,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 8,
    color: '#aaa',
  },
  inputGroup: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 13,
    border: '1px solid #3a3a3a',
    borderRadius: 6,
    background: '#242424',
    color: '#fff',
    outline: 'none',
  },
  iconButton: {
    padding: '8px',
    border: '1px solid #3a3a3a',
    borderRadius: 6,
    background: '#242424',
    color: '#fff',
    cursor: 'pointer',
  },
  buttonGroup: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  button: {
    flex: 1,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
  },
  dangerButton: {
    background: '#ef4444',
    flex: 'none',
  },
  hint: {
    fontSize: 11,
    color: '#666',
    marginTop: 8,
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  radioGroup: {
    display: 'flex',
    gap: 16,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
  footer: {
    paddingTop: 16,
    borderTop: '1px solid #3a3a3a',
  },
  footerText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
