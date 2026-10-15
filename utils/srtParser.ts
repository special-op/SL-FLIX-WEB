export interface SrtCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

const parseSrtTime = (timeStr: string): number => {
  const [hms, ms] = timeStr.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
};

export const parseSrt = (data: string): SrtCue[] => {
  const cues: SrtCue[] = [];
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sections = normalized.split(/\n\s*\n/);
  
  for (const section of sections) {
    const lines = section.trim().split('\n');
    if (lines.length < 3) continue;
    
    const id = lines[0].trim();
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) continue;
    
    const start = parseSrtTime(timeMatch[1]);
    const end = parseSrtTime(timeMatch[2]);
    const text = lines.slice(2).join('\n').trim();
    
    cues.push({ id, start, end, text });
  }
  
  return cues;
};

export const fetchAndParseSrt = async (url: string): Promise<SrtCue[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('SRT fetch failed');
    const text = await response.text();
    return parseSrt(text);
  } catch (err) {
    console.error('SRT Parse Error:', err);
    return [];
  }
};
