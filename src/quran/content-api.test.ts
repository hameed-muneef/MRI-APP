import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanQuranText, fetchWordMeanings, getAsbabNuzul } from './content-api';

describe('cleanQuranText', () => {
  it('strips footnote sups and preserves paragraph breaks without concatenating words', () => {
    const raw = '<p>القول في تأويل قوله تعالى &laquo;اللَّهُ&raquo;<sup foot_note=12>1</sup></p><p>قال أبو جعفر:&nbsp;معناه المعبود.</p>';
    expect(cleanQuranText(raw)).toBe('القول في تأويل قوله تعالى «اللَّهُ»\n\nقال أبو جعفر: معناه المعبود.');
  });

  it('decodes HTML entities and removes stray sup numbers in translations', () => {
    const raw = 'Allāh - there is no deity except Him,<sup foot_note=196031>1</sup> &quot;the Ever-Living&quot;.';
    expect(cleanQuranText(raw)).toBe('Allāh - there is no deity except Him, "the Ever-Living".');
  });
});

describe('getAsbabNuzul', () => {
  it('returns documented occasions for known ayahs and null when absent', () => {
    expect(getAsbabNuzul('2:89')).toContain('الْكَافِرِينَ');
    expect(getAsbabNuzul('1:1')).toBeNull();
  });
});

describe('fetchWordMeanings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries cleanly after an initial network failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ '1:1': [['بسم', 'الباء للاستعانة']] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWordMeanings('1:1')).rejects.toThrow('offline');
    const recovered = await fetchWordMeanings('1:1');
    expect(recovered).toEqual([{ word: 'بسم', meaning: 'الباء للاستعانة' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
