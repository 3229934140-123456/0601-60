import { ThemeConfig } from '../types';

const defaultTheme: ThemeConfig = {
  primaryColor: '#4A90E2',
  secondaryColor: '#7B68EE',
  accentColor: '#FF6B6B',
  backgroundColor: '#FFFFFF',
  textColor: '#333333',
  buttonTextColor: '#FFFFFF',
  borderRadius: 8,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
};

class ThemeManager {
  private theme: ThemeConfig = { ...defaultTheme };
  private styleElement: HTMLStyleElement | null = null;

  setTheme(theme: Partial<ThemeConfig>): void {
    this.theme = { ...this.theme, ...theme };
    this.applyTheme();
  }

  getTheme(): ThemeConfig {
    return { ...this.theme };
  }

  getColor(key: keyof ThemeConfig): string | number | undefined {
    return this.theme[key];
  }

  private applyTheme(): void {
    if (typeof document === 'undefined') return;

    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'edu-shortvideo-theme';
      document.head.appendChild(this.styleElement);
    }

    const cssVars = this.generateCSSVariables();
    this.styleElement.textContent = `
      :root {
        ${cssVars}
      }
      .edu-sv-btn-primary {
        background-color: var(--edu-sv-primary);
        color: var(--edu-sv-btn-text);
        border-radius: var(--edu-sv-radius);
        font-family: var(--edu-sv-font);
      }
      .edu-sv-text {
        color: var(--edu-sv-text);
        font-family: var(--edu-sv-font);
      }
      .edu-sv-bg {
        background-color: var(--edu-sv-bg);
      }
    `;
  }

  private generateCSSVariables(): string {
    return `
      --edu-sv-primary: ${this.theme.primaryColor};
      --edu-sv-secondary: ${this.theme.secondaryColor};
      --edu-sv-accent: ${this.theme.accentColor};
      --edu-sv-bg: ${this.theme.backgroundColor};
      --edu-sv-text: ${this.theme.textColor};
      --edu-sv-btn-text: ${this.theme.buttonTextColor};
      --edu-sv-radius: ${this.theme.borderRadius}px;
      --edu-sv-font: ${this.theme.fontFamily};
    `.trim();
  }

  reset(): void {
    this.theme = { ...defaultTheme };
    this.applyTheme();
  }
}

export default ThemeManager;
