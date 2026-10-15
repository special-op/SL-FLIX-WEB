export interface CaptionSettings {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontFamily: string;
  backgroundColor: string;
  bgOpacity: number;
  textColor: string;
  textShadow: string;
  textOutline: boolean;
  fontWeight: string;
  fontColor: string;
  bgColor: string;
}

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  fontSize: 'medium',
  fontFamily: 'Manrope',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  bgOpacity: 0.6,
  textColor: '#ffffff',
  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
  textOutline: false,
  fontWeight: 'normal',
  fontColor: '#ffffff',
  bgColor: '#000000'
};

export const getStoredCaptionSettings = (): CaptionSettings => {
  const stored = localStorage.getItem('slflix_caption_settings');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  return DEFAULT_CAPTION_SETTINGS;
};

export const saveStoredCaptionSettings = (settings: CaptionSettings) => {
  localStorage.setItem('slflix_caption_settings', JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('slflix_caption_settings_change', { detail: settings }));
};

export const getCaptionFontFamilyCss = (family: string) => family || 'Manrope';
export const getCaptionBgCss = (bg: string, opacity?: number) => bg || 'rgba(0,0,0,0.6)';
export const getCaptionTextShadowCss = (shadow: string, outline?: boolean, color?: string) => {
  if (!outline) return shadow || 'none';
  const outlineColor = color === '#000000' || color === 'black' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.8)';
  const baseShadow = shadow || '';
  return `${baseShadow}${baseShadow ? ', ' : ''}-1px -1px 0 ${outlineColor}, 1px -1px 0 ${outlineColor}, -1px 1px 0 ${outlineColor}, 1px 1px 0 ${outlineColor}`;
};
